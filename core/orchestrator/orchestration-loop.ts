/**
 * OrchestrationLoop — 编排循环（插件的心脏）
 *
 * 从被删掉的原始 leaderDecisionLoop 伪代码恢复并重写为基于 DSH SubagentRuntime 的真实实现。
 *
 * 循环流程：
 *   1. 接收用户目标
 *   2. 调用 Leader subagent → 获得原始输出
 *   3. LeaderPlanner.parseLeaderOutput → 校验为 LeaderAction
 *   4. 执行 action：
 *      - create_task → 在 TeamRuntime 创建任务 → 派给对应角色 subagent → 等待结果 → 记录质量
 *      - request_review → 派给 reviewer subagent → 记录质量
 *      - request_test → 派给 tester subagent → 记录质量
 *      - request_docs → 派给 docs subagent → 记录质量
 *      - unblock_task → 解除任务阻塞
 *      - report → 标记完成，退出循环
 *      - ask_user → 暂停等待用户输入
 *   5. 循环回到第 2 步
 *
 * 支持暂停/恢复/取消，尊重工作区锁和并发限制。
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

// ===== 类型定义 =====

/** DSH SubagentRuntime 的最小接口（避免硬依赖） */
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

/** DSH SubagentRun 的最小接口 */
export interface SubagentRunLike {
  result: Promise<SubagentResultLike>;
  dispose(): Promise<void>;
}

/** DSH SubagentResult 的最小接口 */
export interface SubagentResultLike {
  output: ContentBlock[];
  stopReason: string;
  structured?: unknown;
  diagnostic?: string;
}

/** 提取文本内容 */
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

/** 将文本转为 ContentBlock[]（文本块） */
function toContentBlocks(text: string): ContentBlock[] {
  return [{ type: 'text', text } as ContentBlock];
}

/** 编排循环的配置 */
export interface OrchestrationLoopConfig {
  /** 最大循环迭代次数（防止无限循环） */
  maxIterations?: number;
  /** 每个 subagent 调用的超时（毫秒） */
  taskTimeoutMs?: number;
  /** Leader 的 decision prompt */
  leaderDecisionPrompt?: string;
}

/** 编排循环的状态 */
export type LoopState = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

/** 编排事件监听器 */
export type LoopListener = (event: LoopEvent) => void;

/** 编排事件 */
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

// ===== 编排循环 =====

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
      taskTimeoutMs: config?.taskTimeoutMs ?? 300_000, // 5 分钟
      leaderDecisionPrompt: config?.leaderDecisionPrompt ?? '',
    };
  }

  // ===== Subagent 绑定 =====

  /** 绑定 DSH SubagentRuntime 实例 */
  bindSubagentRuntime(rt: SubagentRuntimeLike): void {
    this.subagentRuntime = rt;
  }

  // ===== 状态管理 =====

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
        // 监听器错误不影响主流程
      }
    }
  }

  // ===== 公共 API =====

  /**
   * 启动编排循环
   * @param goal 用户目标
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

    // 启动团队
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

  /** 暂停循环 */
  pause(): void {
    if (this.state !== 'running') return;
    this.runtime.pause();
    this.state = 'paused';
    this.emit('loop_paused');
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /** 恢复循环 */
  resume(): void {
    if (this.state !== 'paused') return;
    this.runtime.resume();
    this.state = 'running';
    this.abortController = new AbortController();
    this.emit('loop_resumed');
    // 异步恢复循环
    this.runLoop().catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      this.emit('loop_failed', { message });
      this.runtime.fail(message);
      this.state = 'failed';
    });
  }

  /** 取消循环 */
  cancel(): void {
    this.state = 'cancelled';
    if (this.abortController) {
      this.abortController.abort();
    }
    this.runtime.cancel();
    this.emit('loop_cancelled');
  }

  /**
   * 回答 Leader 的问题
   * 当 Leader 发出 ask_user 后，循环暂停等待用户回答。
   * 用户回答后调用此方法，循环继续。
   */
  answerUser(response: string): void {
    if (this.userResponseResolver) {
      this.userResponseResolver(response);
      this.userResponseResolver = null;
    }
  }

  // ===== 核心循环 =====

  private async runLoop(): Promise<void> {
    const maxIter = this.config.maxIterations;

    for (let iter = 0; iter < maxIter; iter++) {
      // 检查是否被取消或暂停
      if (this.state === 'cancelled' || this.state === 'paused') {
        return;
      }

      // 获取当前团队状态
      const snapshot = this.runtime.getSnapshot();

      // 检查是否已经完成
      if (snapshot.status === 'completed' || snapshot.status === 'failed' || snapshot.status === 'cancelled') {
        this.state = snapshot.status === 'completed' ? 'completed' : snapshot.status === 'cancelled' ? 'cancelled' : 'failed';
        if (this.state === 'completed') {
          this.emit('loop_completed');
        }
        return;
      }

      // 1. 构建 Leader prompt
      const leaderPrompt = this.buildLeaderPrompt(snapshot, this.currentGoal!);

      // 2. 调用 Leader subagent
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

      // 3. 解析 Leader 输出
      const parseResult = await this.planner.parseLeaderOutput(
        leaderOutput,
        snapshot,
        undefined, // 无重试函数（首版不自动重试 LLM 调用）
      );

      if (!parseResult.action) {
        // Leader 输出无效，记录错误并继续循环
        this.emit('error', {
          message: `Leader output invalid after ${parseResult.retries} retries: ${parseResult.errors.join('; ')}`,
        });
        // 尝试让 Leader 重新决策
        continue;
      }

      this.emit('leader_action_validated', {
        action: parseResult.action,
        message: parseResult.action.type,
      });

      // 4. 执行 action
      const shouldStop = await this.executeAction(parseResult.action, snapshot.members);

      if (shouldStop) {
        return;
      }
    }

    // 超过最大迭代次数
    throw new Error(`Max iterations (${maxIter}) reached without completion`);
  }

  // ===== Leader Prompt 构建 =====

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
      '## 团队目标',
      goal,
      '',
      '## 当前团队状态',
      '- 状态: ' + snapshot.status,
      '- 成员:',
      members,
      '',
      '## 任务列表',
      tasks || '（无任务）',
      '',
      '## 最近事件',
      recentEvents || '（无事件）',
    ];

    if (memory) {
      parts.push('', '## 相关记忆', memory);
    }

    parts.push(
      '',
      '## 你的决策',
      '查看以上信息，决定下一步。输出 JSON 动作之一：',
      '- create_task: 创建子任务',
      '- unblock_task: 解除任务阻塞',
      '- request_review: 请求审核',
      '- request_test: 请求测试',
      '- request_docs: 请求文档',
      '- report: 汇报完成',
      '- ask_user: 询问用户',
    );

    return parts.join('\n');
  }

  // ===== Action 执行 =====

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

    // 在 TeamRuntime 中创建任务
    const task = this.runtime.createTask(
      action.task.title,
      action.task.description,
      action.task.role as RoleId,
      action.task.dependencies || [],
    );

    this.emit('task_dispatched', { taskId: task.id, message: 'Created: ' + task.title });

    // 派给对应角色的 subagent 执行
    await this.dispatchAndExecuteTask(task);

    return false;
  }

  private async executeUnblockTask(action: LeaderAction): Promise<boolean> {
    if (!action.taskId) {
      this.emit('error', { message: 'unblock_task action missing "taskId" field' });
      return false;
    }

    // 解除阻塞
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

    // 获取被审核的任务
    const snapshot = this.runtime.getSnapshot();
    const targetTask = snapshot.tasks.find((t) => t.id === action.taskId);
    if (!targetTask) {
      this.emit('error', { message: 'Task not found: ' + action.taskId });
      return false;
    }

    // 构建 reviewer prompt
    const reviewPrompt = this.buildReviewPrompt(targetTask, action.reason);

    // 调用 reviewer subagent
    const output = await this.callSubagent(reviewer, reviewPrompt);

    // 解析质量结论
    const quality = this.parseQualityResult(output, 'approved', 'changes_requested');

    // 记录质量
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

    // 解析任务结果
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

    // 暂停循环，等待用户回答
    this.runtime.pause();
    const response = await new Promise<string>((resolve) => {
      this.userResponseResolver = resolve;
    });

    // 用户回答后恢复
    this.runtime.resume();

    // 将用户回答注入到当前目标
    this.currentGoal = (this.currentGoal || '') + '\n\n用户补充：' + response;

    return false;
  }

  // ===== 任务派发与执行 =====

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

    // 迁移到 ready 再到 running
    this.runtime.transitionTask(task.id, 'ready');
    this.runtime.transitionTask(task.id, 'running');

    this.emit('task_dispatched', {
      taskId: task.id,
      memberId: assignee.id,
      message: 'Dispatched to ' + assignee.name + ': ' + task.title,
    });

    // 构建 task prompt
    const taskPrompt = this.buildTaskPrompt(task, assignee);

    try {
      // 调用 subagent 执行任务
      const output = await this.callSubagent(assignee, taskPrompt);

      // 解析任务结果
      const result = this.parseTaskResult(output);

      // 记录结果
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

      // 任务失败
      this.runtime.transitionTask(task.id, 'failed', {
        status: 'failed',
        summary: message,
        artifacts: [],
        issues: [],
      });
    }
  }

  // ===== Subagent 调用 =====

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

  // ===== Prompt 构建 =====

  private buildTaskPrompt(task: Task, member: MemberConfig): string {
    const memory = this.runtime.getMemoryForTask(task.id);
    const parts: string[] = [
      member.skillPrompt || ('你是团队的' + member.name + '（' + member.role + '）。'),
      '',
      '## 你的任务',
      task.title,
      '',
      '## 任务描述',
      task.description,
    ];

    if (task.dependencies.length > 0) {
      parts.push('', '## 依赖任务', ...task.dependencies.map((d) => '- ' + d));
    }

    if (memory) {
      parts.push('', '## 相关记忆', memory);
    }

    parts.push(
      '',
      '## 完成后报告',
      '输出 JSON：',
      '```json',
      '{',
      '  "status": "completed" | "failed" | "blocked",',
      '  "summary": "完成摘要",',
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
      '你是团队的审核员。',
      '',
      '## 审核任务',
      task.title,
      '',
      '## 任务描述',
      task.description,
      '',
      '## 执行者报告',
      result?.summary || '（无报告）',
    ];

    if (result?.artifacts && result.artifacts.length > 0) {
      parts.push('产出文件: ' + result.artifacts.join(', '));
    }

    parts.push(
      '',
      '## 审核原因',
      reason,
      '',
      '## 审核要求',
      '检查代码质量、安全性、可维护性。',
      '',
      '## 审核结论格式',
      '输出 JSON：',
      '```json',
      '{',
      '  "status": "approved" | "changes_requested",',
      '  "summary": "审核结论摘要",',
      '  "issues": [',
      '    { "severity": "critical" | "warning" | "suggestion", "file": "path", "line": 42, "description": "问题描述", "suggestion": "修复建议" }',
      '  ]',
      '}',
      '```',
    );

    return parts.join('\n');
  }

  private buildTestPrompt(task: Task, reason: string): string {
    const result = task.result;
    const parts: string[] = [
      '你是团队的测试员。',
      '',
      '## 测试任务',
      task.title,
      '',
      '## 任务描述',
      task.description,
      '',
      '## 执行者报告',
      result?.summary || '（无报告）',
    ];

    if (result?.artifacts && result.artifacts.length > 0) {
      parts.push('产出文件: ' + result.artifacts.join(', '));
    }

    parts.push(
      '',
      '## 测试原因',
      reason,
      '',
      '## 测试结论格式',
      '输出 JSON：',
      '```json',
      '{',
      '  "status": "test_passed" | "test_failed",',
      '  "summary": "测试结论摘要",',
      '  "issues": [',
      '    { "severity": "critical" | "warning" | "suggestion", "file": "path", "line": 42, "description": "问题描述", "suggestion": "修复建议" }',
      '  ]',
      '}',
      '```',
    );

    return parts.join('\n');
  }

  private buildDocsPrompt(task: Task, reason: string): string {
    const parts: string[] = [
      '你是团队的文档员。',
      '',
      '## 文档任务',
      task.title,
      '',
      '## 任务描述',
      task.description,
      '',
      '## 文档原因',
      reason,
      '',
      '## 完成后报告',
      '输出 JSON：',
      '```json',
      '{',
      '  "status": "completed",',
      '  "summary": "文档完成摘要",',
      '  "artifacts": ["docs.md"],',
      '  "issues": []',
      '}',
      '```',
    ];

    return parts.join('\n');
  }

  // ===== 结果解析 =====

  private parseTaskResult(raw: string): TaskResult {
    // 尝试提取 JSON
    const jsonStr = this.extractJSON(raw);
    if (jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr);
        const validation = validateTaskResult(parsed);
        if (validation.valid && validation.result) {
          return validation.result;
        }
      } catch {
        // JSON 解析失败
      }
    }

    // 如果无法解析结构化结果，从原始文本生成
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
        // JSON 解析失败
      }
    }

    // 如果无法解析，默认通过（不阻塞流程）
    return {
      status: passStatus,
      summary: raw.slice(0, 500),
      issues: [],
    };
  }

  private extractJSON(text: string): string | null {
    const trimmed = text.trim();

    // 直接 JSON
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return trimmed;
    }

    // 从 markdown 代码块中提取
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // 尝试找到第一个 { 到最后一个 }
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return trimmed.slice(firstBrace, lastBrace + 1);
    }

    return null;
  }

  // ===== 清理 =====

  dispose(): void {
    this.listeners = [];
    this.abortController = null;
    this.userResponseResolver = null;
  }
}
