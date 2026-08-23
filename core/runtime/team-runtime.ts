/**
 * TeamRuntime — team runtime service
 *
 * Uses an "append-event + state projection" model to manage team state.
 * All state changes go through appendEvent. State is derived from event projection.
 * State transitions are validated by reducers. Invalid transitions are rejected and audited.
 *
 * Integrates WorkspaceLock (serial writes) and MemoryService (memory injection).
 * Supports event persistence and restart recovery.
 */

import type { Context } from '@deepseek-ai/cordis';
import { randomUUID } from 'node:crypto';
import { writeFileSync, readFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  TeamConfig,
  TeamState,
  TeamStatus,
  TeamEvent,
  TaskStatus,
  Task,
  TaskResult,
  QualityResult,
  MemberConfig,
  InterventionCommand,
  Issue,
} from './types';
import { WorkspaceLock } from './workspace-lock';
import { MemoryService } from '../../memory/store';

// ===== State transition rules =====

const TEAM_TRANSITIONS: Record<TeamStatus, TeamStatus[]> = {
  idle: ['planning', 'cancelled'],
  planning: ['running', 'failed', 'cancelled'],
  running: ['paused', 'completed', 'failed', 'cancelled'],
  paused: ['running', 'failed', 'cancelled'],
  completed: [],
  failed: ['planning', 'cancelled'],
  cancelled: [],
};

const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  planned: ['ready', 'cancelled'],
  ready: ['running', 'blocked', 'cancelled'],
  running: ['blocked', 'passed', 'failed', 'cancelled'],
  blocked: ['ready', 'cancelled'],
  passed: ['failed'],
  failed: ['ready', 'passed', 'cancelled'],
  cancelled: [],
};

function canTransition(from: TeamStatus, to: TeamStatus): boolean {
  return TEAM_TRANSITIONS[from]?.includes(to) ?? false;
}

function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_TRANSITIONS[from]?.includes(to) ?? false;
}

// ===== Event store + state projection =====

export class TeamRuntime {
  private ctx: Context;
  private config: TeamConfig;
  private events: TeamEvent[] = [];
  private state: TeamState;
  private listeners: ((event: TeamEvent) => void)[] = [];
  private disposed = false;

  /** Workspace lock */
  private workspaceLock: WorkspaceLock;

  /** Memory service */
  private memory: MemoryService;

  /** Persistence path */
  private persistencePath: string | null = null;

  /** Subagent provider binding (injected by DSH) */
  private subagentProvider: unknown = null;

  constructor(ctx: Context, config: TeamConfig) {
    this.ctx = ctx;
    this.config = config;

    // Initialize workspace lock
    this.workspaceLock = new WorkspaceLock(config.workspace);

    // Initialize memory service
    const memoryDir = config.memoryEnabled
      ? resolve(config.workspace, '.colleague', 'memory')
      : undefined;
    this.memory = new MemoryService(memoryDir);

    // Set persistence path
    if (config.memoryEnabled) {
      this.persistencePath = resolve(config.workspace, '.colleague', 'events.jsonl');
    }

    // Attempt to restore from persistence
    const restored = this.load();

    if (restored) {
      // Replay state from events
      this.state = this.replayEvents(restored);
    } else {
      // Fresh initialization
      this.state = {
        id: config.teamId,
        name: config.teamName,
        status: 'idle',
        members: [...config.members],
        tasks: [],
        events: [],
        workspace: config.workspace,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      this.appendEvent('team_created', { members: config.members });
      for (const member of config.members) {
        this.appendEvent('member_added', { memberId: member.id, member });
      }
    }
  }

  // ===== Event appending =====

  private appendEvent(
    type: TeamEvent['type'],
    data: Record<string, unknown> = {},
    taskId?: string,
    memberId?: string,
  ): TeamEvent {
    const event: TeamEvent = {
      id: randomUUID(),
      type,
      teamId: this.state.id,
      taskId,
      memberId,
      data,
      timestamp: Date.now(),
    };

    this.events.push(event);
    this.state.events.push(event);

    // Project state
    this.project(event);

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Listener errors do not affect the main flow
      }
    }

    this.state.updatedAt = Date.now();

    // Persist
    this.persist(event);

    // Record to memory
    this.recordToMemory(event);

    return event;
  }

  // ===== State projection reducer =====

  private project(event: TeamEvent): void {
    switch (event.type) {
      case 'team_created':
        // Initial state already set in constructor
        break;

      case 'team_status_changed':
        this.state.status = event.data.status as TeamStatus;
        break;

      case 'member_added': {
        const member = event.data.member as MemberConfig;
        if (!this.state.members.find((m) => m.id === member.id)) {
          this.state.members.push(member);
        }
        break;
      }

      case 'member_removed': {
        const memberId = event.data.memberId as string;
        this.state.members = this.state.members.filter(
          (m) => m.id !== memberId,
        );
        break;
      }

      case 'task_created': {
        const task = event.data.task as Task;
        if (!this.state.tasks.find((t) => t.id === task.id)) {
          this.state.tasks.push(task);
        }
        break;
      }

      case 'task_status_changed': {
        const taskId = event.taskId!;
        const status = event.data.status as TaskStatus;
        const task = this.state.tasks.find((t) => t.id === taskId);
        if (task) {
          task.status = status;
          task.updatedAt = Date.now();
          if (event.data.result) {
            task.result = event.data.result as TaskResult;
          }
        }
        break;
      }

      case 'task_assigned': {
        const taskId = event.taskId!;
        const assigneeId = event.data.assigneeId as string;
        const task = this.state.tasks.find((t) => t.id === taskId);
        if (task) {
          task.assigneeId = assigneeId;
          task.updatedAt = Date.now();
        }
        break;
      }

      case 'quality_recorded': {
        const taskId = event.taskId!;
        const quality = event.data.quality as QualityResult;
        const task = this.state.tasks.find((t) => t.id === taskId);
        if (task) {
          task.quality = quality;
          task.updatedAt = Date.now();
        }
        break;
      }

      case 'artifact_added': {
        const taskId = event.taskId!;
        const artifacts = event.data.artifacts as string[];
        const task = this.state.tasks.find((t) => t.id === taskId);
        if (task && task.result) {
          task.result.artifacts.push(...artifacts);
        }
        break;
      }

      case 'message_sent':
      case 'user_intervention':
      case 'error':
        // These events are only recorded in the event stream; UI reads from event projection
        break;
    }
  }

  // ===== Public API =====

  /** Get current team state snapshot */
  getSnapshot(): TeamState {
    return {
      ...this.state,
      members: [...this.state.members],
      tasks: this.state.tasks.map((t) => ({ ...t })),
      // Only include recent events to avoid unbounded snapshot size
      events: this.state.events.slice(-100),
    };
  }

  /** Subscribe to event stream */
  subscribe(listener: (event: TeamEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /** Get historical events */
  getEvents(since?: number): TeamEvent[] {
    if (since === undefined) return [...this.events];
    return this.events.filter((e) => e.timestamp > since);
  }

  /** Get memory service */
  getMemory(): MemoryService {
    return this.memory;
  }

  /** Get workspace lock */
  getWorkspaceLock(): WorkspaceLock {
    return this.workspaceLock;
  }

  // ===== Team state transitions =====

  /** Start planning */
  startPlanning(): void {
    this.transitionTeam('planning');
  }

  /** Start running */
  startRunning(): void {
    this.transitionTeam('running');
  }

  /** Pause */
  pause(): void {
    this.transitionTeam('paused');
    this.appendEvent('user_intervention', { type: 'pause' });
  }

  /** Resume */
  resume(): void {
    this.transitionTeam('running');
    this.appendEvent('user_intervention', { type: 'resume' });
  }

  /** Complete */
  complete(summary: string): void {
    this.transitionTeam('completed');
    this.appendEvent('team_status_changed', { status: 'completed', summary });
  }

  /** Fail */
  fail(reason: string): void {
    this.transitionTeam('failed');
    this.appendEvent('team_status_changed', { status: 'failed', reason });
  }

  /** Cancel */
  cancel(): void {
    this.transitionTeam('cancelled');
    this.appendEvent('team_status_changed', { status: 'cancelled' });
  }

  private transitionTeam(to: TeamStatus): void {
    const from = this.state.status;
    if (!canTransition(from, to)) {
      this.appendEvent('error', {
        message: `Invalid team status transition: ${from} → ${to}`,
        from,
        to,
      });
      throw new Error(`Invalid team status transition: ${from} → ${to}`);
    }
    this.state.status = to;
    this.appendEvent('team_status_changed', { from, to, status: to });
  }

  // ===== Task management =====

  /** Create task */
  createTask(
    title: string,
    description: string,
    role: MemberConfig['role'],
    dependencies: string[] = [],
  ): Task {
    const assignee = this.state.members.find((m) => m.role === role);
    if (!assignee) {
      throw new Error(`No member with role "${role}" available`);
    }

    // Validate dependency tasks exist
    for (const depId of dependencies) {
      if (!this.state.tasks.find((t) => t.id === depId)) {
        throw new Error(`Dependency task not found: ${depId}`);
      }
    }

    // Check for circular dependencies
    this.checkCircularDependency(dependencies, []);

    const task: Task = {
      id: randomUUID(),
      title,
      description,
      assigneeId: assignee.id,
      role,
      status: 'planned',
      dependencies,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.appendEvent('task_created', { task }, task.id);
    return task;
  }

  /** Check circular dependencies */
  private checkCircularDependency(
    dependencies: string[],
    visited: string[],
  ): void {
    for (const depId of dependencies) {
      if (visited.includes(depId)) {
        throw new Error(
          `Circular dependency detected: ${[...visited, depId].join(' → ')}`,
        );
      }
      const dep = this.state.tasks.find((t) => t.id === depId);
      if (dep) {
        this.checkCircularDependency(dep.dependencies, [...visited, depId]);
      }
    }
  }

  /** Task status transition */
  transitionTask(taskId: string, to: TaskStatus, result?: TaskResult): void {
    const task = this.state.tasks.find((t) => t.id === taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const from = task.status;
    if (!canTransitionTask(from, to)) {
      this.appendEvent('error', {
        message: `Invalid task status transition: ${from} → ${to} for task ${taskId}`,
        taskId,
        from,
        to,
      });
      throw new Error(
        `Invalid task status transition: ${from} → ${to} for task ${taskId}`,
      );
    }

    // Check dependencies are completed
    if (to === 'ready' || to === 'running') {
      for (const depId of task.dependencies) {
        const dep = this.state.tasks.find((t) => t.id === depId);
        if (dep && dep.status !== 'passed') {
          throw new Error(
            `Cannot start task ${taskId}: dependency ${depId} not passed (status: ${dep.status})`,
          );
        }
      }
    }

    // Check workspace lock (write tasks need to acquire lock)
    if (to === 'running' && (task.role === 'coder' || task.role === 'docs')) {
      if (!this.workspaceLock.acquire(taskId)) {
        // Enter blocked state
        this.appendEvent('task_status_changed', { from, to: 'blocked', status: 'blocked', reason: 'workspace locked' }, taskId);
        return;
      }
    }

    // Release workspace lock
    if ((to === 'passed' || to === 'failed' || to === 'cancelled') &&
        (task.role === 'coder' || task.role === 'docs')) {
      this.workspaceLock.release(taskId);
    }

    this.appendEvent(
      'task_status_changed',
      { from, to, status: to, result },
      taskId,
    );
  }

  /** Record quality result */
  recordQuality(
    taskId: string,
    quality: Omit<QualityResult, 'timestamp'>,
  ): void {
    const task = this.state.tasks.find((t) => t.id === taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const fullQuality: QualityResult = {
      ...quality,
      timestamp: Date.now(),
    };

    this.appendEvent(
      'quality_recorded',
      { quality: fullQuality },
      taskId,
    );

    // Transition task state based on quality result
    if (quality.status === 'approved' || quality.status === 'test_passed') {
      // If already in passed state, no need to transition
      if (task.status !== 'passed') {
        this.transitionTask(taskId, 'passed');
      }
    } else if (
      quality.status === 'changes_requested' ||
      quality.status === 'test_failed'
    ) {
      // If already in failed state, no need to transition
      if (task.status !== 'failed') {
        this.transitionTask(taskId, 'failed', {
          status: 'failed',
          summary: quality.summary,
          artifacts: [],
          issues: quality.issues,
        });
      }
    }
  }

  // ===== User intervention =====

  handleIntervention(command: InterventionCommand): void {
    switch (command.type) {
      case 'pause':
        this.pause();
        break;
      case 'resume':
        this.resume();
        break;
      case 'skip':
        if (command.taskId) {
          this.transitionTask(command.taskId, 'cancelled');
        } else {
          throw new Error('Skip intervention requires a taskId');
        }
        break;
      case 'takeover':
        this.pause();
        this.appendEvent('user_intervention', {
          type: 'takeover',
          taskId: command.taskId,
        });
        break;
      case 'revise':
        this.appendEvent('user_intervention', {
          type: 'revise',
          message: command.message,
        });
        break;
    }
  }

  // ===== Member management (controlled operations) =====

  addMember(member: MemberConfig): void {
    if (this.state.members.find((m) => m.id === member.id)) {
      throw new Error(`Member with id "${member.id}" already exists`);
    }
    this.appendEvent('member_added', { memberId: member.id, member });
  }

  removeMember(memberId: string): void {
    const member = this.state.members.find((m) => m.id === memberId);
    if (!member) {
      throw new Error(`Member not found: ${memberId}`);
    }
    if (member.role === 'leader') {
      throw new Error('Cannot remove leader member');
    }
    this.appendEvent('member_removed', { memberId });
  }

  // ===== Subagent binding =====

  /** Bind DSH subagent provider (injected by plugin entry) */
  bindSubagentProvider(provider: unknown): void {
    this.subagentProvider = provider;
  }

  /** Get subagent provider */
  getSubagentProvider(): unknown {
    return this.subagentProvider;
  }

  // ===== Memory injection =====

  /** Retrieve relevant memory for a task */
  getMemoryForTask(taskId: string): string {
    // Search by task ID first
    const result = this.memory.searchByTask(taskId);
    if (result.entries.length === 0) return '';
    return result.entries
      .map((e) => `[${e.metadata.source}] ${e.content}`)
      .join('\n\n');
  }

  /** Record event to memory */
  private recordToMemory(event: TeamEvent): void {
    if (!this.config.memoryEnabled) return;

    try {
      const content = JSON.stringify(event.data);
      switch (event.type) {
        case 'quality_recorded':
          this.memory.recordQuality({
            content,
            metadata: { taskId: event.taskId, createdAt: event.timestamp },
          });
          break;
        case 'team_status_changed':
          this.memory.recordDecision({
            content,
            metadata: { createdAt: event.timestamp },
          });
          break;
        case 'task_status_changed': {
          // Check the target status to determine memory category
          const toStatus = event.data.to as string | undefined;
          if (toStatus === 'passed' || toStatus === 'failed' || toStatus === 'blocked') {
            this.memory.recordEvent({
              content,
              metadata: { taskId: event.taskId, createdAt: event.timestamp },
            });
          }
          break;
        }
        case 'user_intervention': {
          // Record user interventions as commands
          this.memory.recordCommand({
            content,
            metadata: { taskId: event.taskId, createdAt: event.timestamp },
          });
          break;
        }
      }
    } catch {
      // Memory recording failure does not block the main flow
    }
  }

  // ===== Persistence =====

  private persist(event: TeamEvent): void {
    if (!this.persistencePath) return;
    try {
      const dir = resolve(this.persistencePath, '..');
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      // Append-only write — no full rewrite needed
      const line = JSON.stringify(event) + '\n';
      appendFileSync(this.persistencePath, line, 'utf-8');
    } catch {
      // Persistence failure does not block the main flow
    }
  }

  private load(): TeamEvent[] | null {
    if (!this.persistencePath) return null;
    if (!existsSync(this.persistencePath)) return null;
    try {
      const text = readFileSync(this.persistencePath, 'utf-8');
      const lines = text.split('\n').filter((l) => l.trim());
      const events: TeamEvent[] = [];
      for (const line of lines) {
        try {
          events.push(JSON.parse(line) as TeamEvent);
        } catch {
          // Skip corrupted lines
        }
      }
      // Validate team ID matches
      if (events.length > 0 && events[0].teamId !== this.config.teamId) {
        return null;
      }
      return events;
    } catch {
      return null;
    }
  }

  /** Replay state from events */
  private replayEvents(events: TeamEvent[]): TeamState {
    // Extract initial state from first event
    const state: TeamState = {
      id: this.config.teamId,
      name: this.config.teamName,
      status: 'idle',
      members: [],
      tasks: [],
      events: [...events],
      workspace: this.config.workspace,
      createdAt: events[0]?.timestamp ?? Date.now(),
      updatedAt: Date.now(),
    };

    this.events = [...events];

    // Replay each event
    const oldState = this.state;
    this.state = state;
    for (const event of events) {
      this.project(event);
    }
    this.state = state;

    return state;
  }

  // ===== Cleanup =====

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners = [];
    this.workspaceLock = null as unknown as WorkspaceLock;
  }
}
