/**
 * TeamRuntime — 团队运行时服务
 *
 * 采用"追加事件 + 状态投影"模型管理团队状态。
 * 所有状态变更通过 appendEvent 完成，状态由事件投影得出。
 * 状态迁移通过 reducer 校验，非法迁移被拒绝并记录审计事件。
 *
 * 集成 WorkspaceLock（串行写入）和 MemoryService（记忆注入）。
 * 支持事件持久化和重启恢复。
 */

import type { Context } from '@deepseek-ai/cordis';
import { randomUUID } from 'node:crypto';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
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

// ===== 状态迁移规则 =====

const TEAM_TRANSITIONS: Record<TeamStatus, TeamStatus[]> = {
  idle: ['planning', 'cancelled'],
  planning: ['running', 'failed', 'cancelled'],
  running: ['paused', 'completed', 'failed', 'cancelled'],
  paused: ['running', 'cancelled'],
  completed: [],
  failed: ['planning', 'cancelled'],
  cancelled: [],
};

const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  planned: ['ready', 'cancelled'],
  ready: ['running', 'blocked', 'cancelled'],
  running: ['blocked', 'passed', 'failed', 'cancelled'],
  blocked: ['ready', 'cancelled'],
  passed: [],
  failed: ['ready', 'cancelled'],
  cancelled: [],
};

function canTransition(from: TeamStatus, to: TeamStatus): boolean {
  return TEAM_TRANSITIONS[from]?.includes(to) ?? false;
}

function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_TRANSITIONS[from]?.includes(to) ?? false;
}

// ===== 事件存储 + 状态投影 =====

export class TeamRuntime {
  private ctx: Context;
  private config: TeamConfig;
  private events: TeamEvent[] = [];
  private state: TeamState;
  private listeners: ((event: TeamEvent) => void)[] = [];
  private disposed = false;

  /** 工作区锁 */
  private workspaceLock: WorkspaceLock;

  /** 记忆服务 */
  private memory: MemoryService;

  /** 持久化路径 */
  private persistencePath: string | null = null;

  /** subagent provider 绑定（由 DSH 注入） */
  private subagentProvider: unknown = null;

  constructor(ctx: Context, config: TeamConfig) {
    this.ctx = ctx;
    this.config = config;

    // 初始化工作区锁
    this.workspaceLock = new WorkspaceLock(config.workspace);

    // 初始化记忆服务
    const memoryDir = config.memoryEnabled
      ? resolve(config.workspace, '.colleague', 'memory')
      : undefined;
    this.memory = new MemoryService(memoryDir);

    // 设置持久化路径
    if (config.memoryEnabled) {
      this.persistencePath = resolve(config.workspace, '.colleague', 'events.jsonl');
    }

    // 尝试从持久化恢复
    const restored = this.load();

    if (restored) {
      // 从事件重放状态
      this.state = this.replayEvents(restored);
    } else {
      // 全新初始化
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

  // ===== 事件追加 =====

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

    // 投影状态
    this.project(event);

    // 通知监听器
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // 监听器错误不影响主流程
      }
    }

    this.state.updatedAt = Date.now();

    // 持久化
    this.persist(event);

    // 记忆记录
    this.recordToMemory(event);

    return event;
  }

  // ===== 状态投影 reducer =====

  private project(event: TeamEvent): void {
    switch (event.type) {
      case 'team_created':
        // 初始状态已在构造函数中设置
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
        // 这些事件只记录在事件流中，UI 从事件投影读取
        break;
    }
  }

  // ===== 公共 API =====

  /** 获取当前团队状态快照 */
  getSnapshot(): TeamState {
    return {
      ...this.state,
      members: [...this.state.members],
      tasks: this.state.tasks.map((t) => ({ ...t })),
      events: [...this.state.events],
    };
  }

  /** 订阅事件流 */
  subscribe(listener: (event: TeamEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /** 获取历史事件 */
  getEvents(since?: number): TeamEvent[] {
    if (since === undefined) return [...this.events];
    return this.events.filter((e) => e.timestamp > since);
  }

  /** 获取记忆服务 */
  getMemory(): MemoryService {
    return this.memory;
  }

  /** 获取工作区锁 */
  getWorkspaceLock(): WorkspaceLock {
    return this.workspaceLock;
  }

  // ===== 团队状态迁移 =====

  /** 开始规划 */
  startPlanning(): void {
    this.transitionTeam('planning');
  }

  /** 开始运行 */
  startRunning(): void {
    this.transitionTeam('running');
  }

  /** 暂停 */
  pause(): void {
    this.transitionTeam('paused');
    this.appendEvent('user_intervention', { type: 'pause' });
  }

  /** 恢复 */
  resume(): void {
    this.transitionTeam('running');
    this.appendEvent('user_intervention', { type: 'resume' });
  }

  /** 完成 */
  complete(summary: string): void {
    this.transitionTeam('completed');
    this.appendEvent('team_status_changed', { status: 'completed', summary });
  }

  /** 失败 */
  fail(reason: string): void {
    this.transitionTeam('failed');
    this.appendEvent('team_status_changed', { status: 'failed', reason });
  }

  /** 取消 */
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

  // ===== 任务管理 =====

  /** 创建任务 */
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

    // 验证依赖任务存在
    for (const depId of dependencies) {
      if (!this.state.tasks.find((t) => t.id === depId)) {
        throw new Error(`Dependency task not found: ${depId}`);
      }
    }

    // 检查循环依赖
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

  /** 检查循环依赖 */
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

  /** 任务状态迁移 */
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

    // 检查依赖是否已完成
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

    // 检查工作区锁（写任务需要获取锁）
    if (to === 'running' && (task.role === 'coder' || task.role === 'docs')) {
      if (!this.workspaceLock.acquire(taskId)) {
        // 进入 blocked 状态
        this.appendEvent('task_status_changed', { from, to: 'blocked', status: 'blocked', reason: 'workspace locked' }, taskId);
        return;
      }
    }

    // 释放工作区锁
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

  /** 记录质量结论 */
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

    // 根据质量结论迁移任务状态
    if (quality.status === 'approved' || quality.status === 'test_passed') {
      this.transitionTask(taskId, 'passed');
    } else if (
      quality.status === 'changes_requested' ||
      quality.status === 'test_failed'
    ) {
      // 创建修复任务
      this.transitionTask(taskId, 'failed', {
        status: 'failed',
        summary: quality.summary,
        artifacts: [],
        issues: quality.issues,
      });
    }
  }

  // ===== 用户介入 =====

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

  // ===== 成员管理（受控操作） =====

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

  // ===== Subagent 绑定 =====

  /** 绑定 DSH subagent provider（由插件入口注入） */
  bindSubagentProvider(provider: unknown): void {
    this.subagentProvider = provider;
  }

  /** 获取 subagent provider */
  getSubagentProvider(): unknown {
    return this.subagentProvider;
  }

  // ===== 记忆注入 =====

  /** 为任务检索相关记忆 */
  getMemoryForTask(taskId: string): string {
    const result = this.memory.searchByTask(taskId);
    if (result.entries.length === 0) return '';
    return result.entries
      .map((e) => `[${e.metadata.source}] ${e.content}`)
      .join('\n\n');
  }

  /** 记录事件到记忆 */
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
        case 'task_completed':
        case 'task_failed':
        case 'task_blocked':
          this.memory.recordEvent({
            content,
            metadata: { taskId: event.taskId, createdAt: event.timestamp },
          });
          break;
      }
    } catch {
      // 记忆记录失败不阻断主流程
    }
  }

  // ===== 持久化 =====

  private persist(event: TeamEvent): void {
    if (!this.persistencePath) return;
    try {
      const dir = resolve(this.persistencePath, '..');
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      // 追加写入
      const line = JSON.stringify(event) + '\n';
      // 读取现有内容追加
      let existing = '';
      if (existsSync(this.persistencePath)) {
        existing = readFileSync(this.persistencePath, 'utf-8');
      }
      writeFileSync(this.persistencePath, existing + line, 'utf-8');
    } catch {
      // 持久化失败不阻断主流程
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
          // 跳过损坏行
        }
      }
      // 验证团队 ID 匹配
      if (events.length > 0 && events[0].teamId !== this.config.teamId) {
        return null;
      }
      return events;
    } catch {
      return null;
    }
  }

  /** 从事件重放状态 */
  private replayEvents(events: TeamEvent[]): TeamState {
    // 从第一个事件提取初始状态
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

    // 重放每个事件
    const oldState = this.state;
    this.state = state;
    for (const event of events) {
      this.project(event);
    }
    this.state = state;

    return state;
  }

  // ===== 清理 =====

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners = [];
    this.workspaceLock = null as unknown as WorkspaceLock;
  }
}
