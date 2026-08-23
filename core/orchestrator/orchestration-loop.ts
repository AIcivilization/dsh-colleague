/**
 * OrchestrationLoop — the orchestrationion loop (heart of the plugin)
 *
 * Reconstructed from the original leaderDecisionLoop pseudocode and rewritten
 * as a real implementation based on DSH SubagentRuntime.
 *
 * Loop flow:
 *   1. Receive user goal
 *   2. Call Leader subagent → get raw output
 *   3. LeaderPlanner.parseLeaderOutput → validate as LeaderAction
 *   4. Execute action:
 *      - create_task → create task in TeamRuntime → dispatch to role subagent → wait for result → record quality
 *      - request_review → dispatch to reviewer subagent → record quality
 *      - request_test → dispatch to tester subagent → record quality
 *      - request_docs → dispatch to docs subagent → record quality
 *      - unblock_task → unblock task
 *      - report → mark complete, exit loop
 *      - ask_user → pause and wait for user input
 *   5. Loop back to step 2
 *
 * Supports pause/resume/cancel. Respects workspace lock and concurrency limits.
 */

import type { TeamRuntime } from '../runtime/team-runtime';
import type { LeaderPlanner } from '../planner/leader-planner';
import type {
  LeaderAction,
  MemberConfig,
  RoleId,
  Task,
  TaskResult,
  QualityResult,
  QualityStatus,
} from '../runtime/types';
import type { ContentBlock } from '@deepseek-ai/dsh-llm';
import {
  validateTaskResult,
  validateQualityResult,
  hasPassedQualityGate,
  needsRevision,
} from '../quality/gates';

// ===== Type definitions =====

/** Minimal interface for DSH SubagentRuntime (avoids hard dependency) */
export interface SubagentRuntimeLike {
  start(
    name: string,
    request: {
      prompt: ContentBlock[];
      parent?: unknown;
      signal?: AbortSignal;
      label?: string;
    },
  ): Promise<SubagentRunLike>;
}

/** Minimal interface for DSH SubagentRun */
export interface SubagentRunLike {
  result: Promise<SubagentResultLike>;
  dispose(): Promise<void>;
}

/** Minimal interface for DSH SubagentResult */
export interface SubagentResultLike {
  output: ContentBlock[];
  stopReason: string;
  structured?: unknown;
  diagnostic?: string;
}

/** Extract text content */
function extractText(blocks: ContentBlock[]): string {
  return blocks
    .map((b) => {
      if (typeof b === 'object' && b !== null && 'type' in b) {
        if (b.type === 'text' && 'text' in b) return (b as { text: string }).text;
      }
      return '';
    })
    .join('');
}

/** Convert text to ContentBlock[] (text blocks) */
function toContentBlocks(text: string): ContentBlock[] {
  return [{ type: 'text', text } as ContentBlock];
}

/** Orchestration loop configuration */
export interface OrchestrationLoopConfig {
  /** Max loop iterations (prevents infinite loop) */
  maxIterations?: number;
  /** Timeout per subagent call (ms) */
  taskTimeoutMs?: number;
  /** Leader decision prompt */
  leaderDecisionPrompt?: string;
}

/** Orchestration loop state */
export type LoopState = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

/** Orchestration event listener */
export type LoopListener = (event: LoopEvent) => void;

/** Orchestration event */
export interface LoopEvent {
  type:
    | 'loop_started'
    | 'loop_paused'
    | 'loop_resumed'
    | 'loop_completed'
    | 'loop_failed'
    | 'loop_cancelled'
    | 'leader_called'
    | 'leader_output_received'
    | 'leader_action_validated'
    | 'task_dispatched'
    | 'task_completed'
    | 'task_failed'
    | 'quality_recorded'
    | 'user_question'
    | 'error';
  message?: string;
  taskId?: string;
  memberId?: string;
  action?: LeaderAction;
  timestamp: number;
}

// ===== Orchestration loop =====

export class OrchestrationLoop {
  private runtime: TeamRuntime;
  private planner: LeaderPlanner;
  private subagentRuntime: SubagentRuntimeLike | null = null;
  private config: Required<OrchestrationLoopConfig>;

  private state: LoopState = 'idle';
  private listeners: LoopListener[] = [];
  private abortController: AbortController | null = null;
  private currentGoal: string | null = null;
  private userResponseResolver: ((response: string) => void) | null = null;

  constructor(
    runtime: TeamRuntime,
    planner: LeaderPlanner,
    config?: OrchestrationLoopConfig,
  ) {
    this.runtime = runtime;
    this.planner = planner;
    this.config = {
      maxIterations: config?.maxIterations ?? 50,
      taskTimeoutMs: config?.taskTimeoutMs ?? 300_000, // 5 minutes
      leaderDecisionPrompt: config?.leaderDecisionPrompt ?? '',
    };
  }

  // ===== Subagent binding =====

  /** Bind DSH SubagentRuntime instance */
  bindSubagentRuntime(rt: SubagentRuntimeLike): void {
    this.subagentRuntime = rt;
  }

  // ===== State management =====

  getState(): LoopState {
    return this.state;
  }

  isRunning(): boolean {
    return this.state === 'running';
  }

  subscribe(listener: LoopListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(type: LoopEvent['type'], data?: Partial<Omit<LoopEvent, 'type' | 'timestamp'>>): void {
    const event: LoopEvent = {
      type,
      ...data,
      timestamp: Date.now(),
    };
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Listener errors do not affect the main flow
      }
    }
  }

  // ===== Public API =====

  /**
   * Start the orchestrationion loop
   * @param goal User goal
   */
  async start(goal: string): Promise<void> {
    if (this.state !== 'idle' && this.state !== 'failed') {
      throw new Error(`Cannot start loop in state: ${this.state}`);
    }

    if (!this.subagentRuntime) {
      throw new Error('SubagentRuntime not bound. Call bindSubagentRuntime() first.');
    }

    this.currentGoal = goal;
    this.abortController = new AbortController();

    // Start team
    this.runtime.startPlanning();
    this.runtime.startRunning();

    this.state = 'running';
    this.emit('loop_started', { message: goal });

    try {
      await this.runLoop();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit('loop_failed', { message });
      this.runtime.fail(message);
      this.state = 'failed';
    }
  }

  /** Pause loop */
  pause(): void {
    if (this.state !== 'running') return;
    this.runtime.pause();
    this.state = 'paused';
    this.emit('loop_paused');
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /** Resume loop */
  resume(): void {
    if (this.state !== 'paused') return;
    this.runtime.resume();
    this.state = 'running';
    this.abortController = new AbortController();
    this.emit('loop_resumed');
    // Async resume loop
    this.runLoop().catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      this.emit('loop_failed', { message });
      this.runtime.fail(message);
      this.state = 'failed';
    });
  }

  /** Cancel loop */
  cancel(): void {
    this.state = 'cancelled';
    if (this.abortController) {
      this.abortController.abort();
    }
    this.runtime.cancel();
    this.emit('loop_cancelled');
  }

  /**
   * Answer the Leader's question.
   * When Leader emits ask_user, the loop pauses waiting for user answer.
   * After user answers, call this method to continue the loop.
   */
  answerUser(response: string): void {
    if (this.userResponseResolver) {
      this.userResponseResolver(response);
      this.userResponseResolver = null;
    }
  }

  // ===== Core loop =====

  private async runLoop(): Promise<void> {
    const maxIter = this.config.maxIterations;

    for (let iter = 0; iter < maxIter; iter++) {
      // Check if cancelled or paused
      if (this.state === 'cancelled' || this.state === 'paused') {
        return;
      }

      // Get current team state
      const snapshot = this.runtime.getSnapshot();

      // Check if already completed
      if (snapshot.status === 'completed' || snapshot.status === 'failed' || snapshot.status === 'cancelled') {
        this.state = snapshot.status === 'completed' ? 'completed' : snapshot.status === 'cancelled' ? 'cancelled' : 'failed';
        if (this.state === 'completed') {
          this.emit('loop_completed');
        }
        return;
      }

      // 1. Build Leader prompt
      const leaderPrompt = this.buildLeaderPrompt(snapshot, this.currentGoal!);

      // 2. Call Leader subagent
      this.emit('leader_called', { message: `Iteration ${iter + 1}` });

      const leaderMember = snapshot.members.find((m) => m.role === 'leader');
      if (!leaderMember) {
        throw new Error('No leader member found in team');
      }

      const leaderOutput = await this.callSubagent(
        leaderMember,
        leaderPrompt,
      );

      this.emit('leader_output_received', { message: leaderOutput.slice(0, 200) });

      // 3. Parse Leader output
      const parseResult = await this.planner.parseLeaderOutput(
        leaderOutput,
        snapshot,
        undefined, // No retry function (first version does not auto-retry LLM calls)
      );

      if (!parseResult.action) {
        // Leader output invalid — log error and continue loop
        this.emit('error', {
          message: `Leader output invalid after ${parseResult.retries} retries: ${parseResult.errors.join('; ')}`,
        });
        // Let Leader re-decide
        continue;
      }

      this.emit('leader_action_validated', {
        action: parseResult.action,
        message: parseResult.action.type,
      });

      // 4. Execute action
      const shouldStop = await this.executeAction(parseResult.action, snapshot.members);

      if (shouldStop) {
        return;
      }
    }

    // Exceeded max iterations
    throw new Error(`Max iterations (${maxIter}) reached without completion`);
  }

  // ===== Leader prompt building =====

  private buildLeaderPrompt(snapshot: ReturnType<TeamRuntime['getSnapshot']>, goal: string): string {
    const tasks = snapshot.tasks.map((t) => {
      const q = t.quality ? ' -> quality: ' + t.quality.status : '';
      const r = t.result ? ' -> result: ' + t.result.summary : '';
      return '  - [' + t.id.slice(0, 8) + '] ' + t.title + ' (' + t.role + ', ' + t.status + ')' + q + r;
    }).join('\n');

    const members = snapshot.members.map((m) => {
      const hasRunning = snapshot.tasks.some((t) => t.assigneeId === m.id && t.status === 'running');
      return '  - ' + m.name + ' (' + m.role + ') - ' + (hasRunning ? 'busy' : 'idle');
    }).join('\n');

    const recentEvents = snapshot.events.slice(-10).map((e) => {
      const detail = (e.data.summary as string) || (e.data.reason as string) || (e.data.status as string) || JSON.stringify(e.data).slice(0, 100);
      return '  [' + e.type + '] ' + detail;
    }).join('\n');

    const memory = this.runtime.getMemoryForTask('') || '';

    const parts: string[] = [
      this.config.leaderDecisionPrompt,
      '',
      '## Team Goal',
      goal,
      '',
      '## Current Team State',
      '- Status: ' + snapshot.status,
      '- Members:',
      members,
      '',
      '## Task List',
      tasks || '(no tasks)',
      '',
      '## Recent Events',
      recentEvents || '(no events)',
    ];

    if (memory) {
      parts.push('', '## Relevant Memory', memory);
    }

    parts.push(
      '',
      '## Your Decision',
      'Review the above and decide the next step. Output one JSON action:',
      '- create_task: create a subtask',
      '- unblock_task: unblock a task',
      '- request_review: request a review',
      '- request_test: request a test',
      '- request_docs: request documentation',
      '- report: report completion',
      '- ask_user: ask the user a question',
    );

    return parts.join('\n');
  }

  // ===== Action execution =====

  private async executeAction(action: LeaderAction, members: MemberConfig[]): Promise<boolean> {
    switch (action.type) {
      case 'create_task':
        return this.executeCreateTask(action);
      case 'unblock_task':
        return this.executeUnblockTask(action);
      case 'request_review':
        return this.executeRequestReview(action, members);
      case 'request_test':
        return this.executeRequestTest(action, members);
      case 'request_docs':
        return this.executeRequestDocs(action, members);
      case 'report':
        return this.executeReport(action);
      case 'ask_user':
        return this.executeAskUser(action);
      default:
        this.emit('error', { message: 'Unknown action type: ' + (action as { type: string }).type });
        return false;
    }
  }

  private async executeCreateTask(action: LeaderAction): Promise<boolean> {
    if (!action.task) {
      this.emit('error', { message: 'create_task action missing "task" field' });
      return false;
    }

    // Create task in TeamRuntime
    const task = this.runtime.createTask(
      action.task.title,
      action.task.description,
      action.task.role as RoleId,
      action.task.dependencies || [],
    );

    this.emit('task_dispatched', { taskId: task.id, message: 'Created: ' + task.title });

    // Dispatch to the corresponding role subagent for execution
    await this.dispatchAndExecuteTask(task);

    return false;
  }

  private async executeUnblockTask(action: LeaderAction): Promise<boolean> {
    if (!action.taskId) {
      this.emit('error', { message: 'unblock_task action missing "taskId" field' });
      return false;
    }

    // Unblock
    this.runtime.transitionTask(action.taskId, 'ready');
    return false;
  }

  private async executeRequestReview(action: LeaderAction, members: MemberConfig[]): Promise<boolean> {
    if (!action.taskId) {
      this.emit('error', { message: 'request_review action missing "taskId"' });
      return false;
    }

    const reviewer = members.find((m) => m.role === 'reviewer');
    if (!reviewer) {
      this.emit('error', { message: 'No reviewer member found' });
      return false;
    }

    // Get the task to review
    const snapshot = this.runtime.getSnapshot();
    const targetTask = snapshot.tasks.find((t) => t.id === action.taskId);
    if (!targetTask) {
      this.emit('error', { message: 'Task not found: ' + action.taskId });
      return false;
    }

    // Build reviewer prompt
    const reviewPrompt = this.buildReviewPrompt(targetTask, action.reason);

    // Call reviewer subagent
    const output = await this.callSubagent(reviewer, reviewPrompt);

    // Parse quality result
    const quality = this.parseQualityResult(output, 'approved', 'changes_requested');

    // Record quality
    this.runtime.recordQuality(action.taskId, {
      status: quality.status as QualityStatus,
      reviewerId: reviewer.id,
      issues: quality.issues,
      summary: quality.summary,
    });

    this.emit('quality_recorded', {
      taskId: action.taskId,
      memberId: reviewer.id,
      message: 'Review: ' + quality.status,
    });

    return false;
  }

  private async executeRequestTest(action: LeaderAction, members: MemberConfig[]): Promise<boolean> {
    if (!action.taskId) {
      this.emit('error', { message: 'request_test action missing "taskId"' });
      return false;
    }

    const tester = members.find((m) => m.role === 'tester');
    if (!tester) {
      this.emit('error', { message: 'No tester member found' });
      return false;
    }

    const snapshot = this.runtime.getSnapshot();
    const targetTask = snapshot.tasks.find((t) => t.id === action.taskId);
    if (!targetTask) {
      this.emit('error', { message: 'Task not found: ' + action.taskId });
      return false;
    }

    const testPrompt = this.buildTestPrompt(targetTask, action.reason);
    const output = await this.callSubagent(tester, testPrompt);
    const quality = this.parseQualityResult(output, 'test_passed', 'test_failed');

    this.runtime.recordQuality(action.taskId, {
      status: quality.status as QualityStatus,
      reviewerId: tester.id,
      issues: quality.issues,
      summary: quality.summary,
    });

    this.emit('quality_recorded', {
      taskId: action.taskId,
      memberId: tester.id,
      message: 'Test: ' + quality.status,
    });

    return false;
  }

  private async executeRequestDocs(action: LeaderAction, members: MemberConfig[]): Promise<boolean> {
    if (!action.taskId) {
      this.emit('error', { message: 'request_docs action missing "taskId"' });
      return false;
    }

    const docs = members.find((m) => m.role === 'docs');
    if (!docs) {
      this.emit('error', { message: 'No docs member found' });
      return false;
    }

    const snapshot = this.runtime.getSnapshot();
    const targetTask = snapshot.tasks.find((t) => t.id === action.taskId);
    if (!targetTask) {
      this.emit('error', { message: 'Task not found: ' + action.taskId });
      return false;
    }

    const docsPrompt = this.buildDocsPrompt(targetTask, action.reason);
    const output = await this.callSubagent(docs, docsPrompt);

    // Parse task result
    const result = this.parseTaskResult(output);
    this.runtime.transitionTask(action.taskId, 'passed', result);

    this.emit('task_completed', {
      taskId: action.taskId,
      memberId: docs.id,
      message: 'Docs: ' + result.summary,
    });

    return false;
  }

  private async executeReport(action: LeaderAction): Promise<boolean> {
    const summary = action.summary || action.reason;
    this.runtime.complete(summary);
    this.state = 'completed';
    this.emit('loop_completed', { message: summary });
    return true;
  }

  private async executeAskUser(action: LeaderAction): Promise<boolean> {
    if (!action.question) {
      this.emit('error', { message: 'ask_user action missing "question"' });
      return false;
    }

    this.emit('user_question', { message: action.question });

    // Pause loop, wait for user answer
    this.runtime.pause();
    const response = await new Promise<string>((resolve) => {
      this.userResponseResolver = resolve;
    });

    // Resume after user answers
    this.runtime.resume();

    // Inject user answer into current goal
    this.currentGoal = (this.currentGoal || '') + '\n\nUser addition: ' + response;

    return false;
  }

  // ===== Task dispatch and execution =====

  private async dispatchAndExecuteTask(task: Task): Promise<void> {
    const snapshot = this.runtime.getSnapshot();
    const assignee = snapshot.members.find((m) => m.id === task.assigneeId);
    if (!assignee) {
      this.emit('error', { message: 'Assignee not found: ' + task.assigneeId });
      this.runtime.transitionTask(task.id, 'failed', {
        status: 'failed',
        summary: 'Assignee not found: ' + task.assigneeId,
        artifacts: [],
        issues: [],
      });
      return;
    }

    // Transition to ready then running
    this.runtime.transitionTask(task.id, 'ready');
    this.runtime.transitionTask(task.id, 'running');

    this.emit('task_dispatched', {
      taskId: task.id,
      memberId: assignee.id,
      message: 'Dispatched to ' + assignee.name + ': ' + task.title,
    });

    // Build task prompt
    const taskPrompt = this.buildTaskPrompt(task, assignee);

    try {
      // Call subagent to execute task
      const output = await this.callSubagent(assignee, taskPrompt);

      // Parse task result
      const result = this.parseTaskResult(output);

      // Record result
      this.runtime.transitionTask(task.id, result.status === 'completed' ? 'passed' : 'failed', result);

      this.emit('task_completed', {
        taskId: task.id,
        memberId: assignee.id,
        message: 'Completed: ' + result.summary,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit('task_failed', {
        taskId: task.id,
        memberId: assignee.id,
        message,
      });

      // Task failed
      this.runtime.transitionTask(task.id, 'failed', {
        status: 'failed',
        summary: message,
        artifacts: [],
        issues: [],
      });
    }
  }

  // ===== Subagent call =====

  private async callSubagent(member: MemberConfig, prompt: string): Promise<string> {
    if (!this.subagentRuntime) {
      throw new Error('SubagentRuntime not bound');
    }

    const signal = this.abortController?.signal ?? new AbortController().signal;

    const run = await this.subagentRuntime.start(member.provider, {
      prompt: toContentBlocks(prompt),
      parent: undefined,
      signal,
      label: member.name + ' (' + member.role + ')',
    });

    try {
      const result = await run.result;
      return extractText(result.output);
    } finally {
      await run.dispose();
    }
  }

  // ===== Prompt building =====

  private buildTaskPrompt(task: Task, member: MemberConfig): string {
    const memory = this.runtime.getMemoryForTask(task.id);
    const parts: string[] = [
      member.skillPrompt || ('You are the team\'s ' + member.name + ' (' + member.role + ').'),
      '',
      '## Your Task',
      task.title,
      '',
      '## Task Description',
      task.description,
    ];

    if (task.dependencies.length > 0) {
      parts.push('', '## Dependency Tasks', ...task.dependencies.map((d) => '- ' + d));
    }

    if (memory) {
      parts.push('', '## Relevant Memory', memory);
    }

    parts.push(
      '',
      '## Completion Report',
      'Output JSON:',
      '```json',
      '{',
      '  "status": "completed" | "failed" | "blocked",',
      '  "summary": "completion summary",',
      '  "artifacts": ["file1.ts", "file2.ts"],',
      '  "issues": []',
      '}',
      '```',
    );

    return parts.join('\n');
  }

  private buildReviewPrompt(task: Task, reason: string): string {
    const result = task.result;
    const parts: string[] = [
      'You are the team\'s Reviewer.',
      '',
      '## Review Task',
      task.title,
      '',
      '## Task Description',
      task.description,
      '',
      '## Executor Report',
      result?.summary || '(no report)',
    ];

    if (result?.artifacts && result.artifacts.length > 0) {
      parts.push('Artifacts: ' + result.artifacts.join(', '));
    }

    parts.push(
      '',
      '## Review Reason',
      reason,
      '',
      '## Review Requirements',
      'Check code quality, security, and maintainability.',
      '',
      '## Review Result Format',
      'Output JSON:',
      '```json',
      '{',
      '  "status": "approved" | "changes_requested",',
      '  "summary": "review conclusion summary",',
      '  "issues": [',
      '    { "severity": "critical" | "warning" | "suggestion", "file": "path", "line": 42, "description": "issue description", "suggestion": "fix suggestion" }',
      '  ]',
      '}',
      '```',
    );

    return parts.join('\n');
  }

  private buildTestPrompt(task: Task, reason: string): string {
    const result = task.result;
    const parts: string[] = [
      'You are the team\'s Tester.',
      '',
      '## Test Task',
      task.title,
      '',
      '## Task Description',
      task.description,
      '',
      '## Executor Report',
      result?.summary || '(no report)',
    ];

    if (result?.artifacts && result.artifacts.length > 0) {
      parts.push('Artifacts: ' + result.artifacts.join(', '));
    }

    parts.push(
      '',
      '## Test Reason',
      reason,
      '',
      '## Test Result Format',
      'Output JSON:',
      '```json',
      '{',
      '  "status": "test_passed" | "test_failed",',
      '  "summary": "test conclusion summary",',
      '  "issues": [',
      '    { "severity": "critical" | "warning" | "suggestion", "file": "path", "line": 42, "description": "issue description", "suggestion": "fix suggestion" }',
      '  ]',
      '}',
      '```',
    );

    return parts.join('\n');
  }

  private buildDocsPrompt(task: Task, reason: string): string {
    const parts: string[] = [
      'You are the team\'s Doc Writer.',
      '',
      '## Documentation Task',
      task.title,
      '',
      '## Task Description',
      task.description,
      '',
      '## Documentation Reason',
      reason,
      '',
      '## Completion Report',
      'Output JSON:',
      '```json',
      '{',
      '  "status": "completed",',
      '  "summary": "documentation completion summary",',
      '  "artifacts": ["docs.md"],',
      '  "issues": []',
      '}',
      '```',
    ];

    return parts.join('\n');
  }

  // ===== Result parsing =====

  private parseTaskResult(raw: string): TaskResult {
    // Attempt to extract JSON
    const jsonStr = this.extractJSON(raw);
    if (jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr);
        const validation = validateTaskResult(parsed);
        if (validation.valid && validation.result) {
          return validation.result;
        }
      } catch {
        // JSON parse failed
      }
    }

    // If structured result cannot be parsed, generate from raw text
    return {
      status: 'completed',
      summary: raw.slice(0, 500),
      artifacts: [],
      issues: [],
    };
  }

  private parseQualityResult(
    raw: string,
    passStatus: string,
    failStatus: string,
  ): { status: string; summary: string; issues: import('../runtime/types').Issue[] } {
    const jsonStr = this.extractJSON(raw);
    if (jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr);
        const validation = validateQualityResult(parsed);
        if (validation.valid && validation.result) {
          return {
            status: validation.result.status,
            summary: validation.result.summary,
            issues: validation.result.issues,
          };
        }
      } catch {
        // JSON parse failed
      }
    }

    // If cannot parse, default to pass (do not block flow)
    return {
      status: passStatus,
      summary: raw.slice(0, 500),
      issues: [],
    };
  }

  private extractJSON(text: string): string | null {
    const trimmed = text.trim();

    // Direct JSON
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return trimmed;
    }

    // Extract from markdown code block
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // Try to find first { to last }
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return trimmed.slice(firstBrace, lastBrace + 1);
    }

    return null;
  }

  // ===== Cleanup =====

  dispose(): void {
    this.listeners = [];
    this.abortController = null;
    this.userResponseResolver = null;
  }
}
