/**
 * TeamRuntime — 团队运行时服务
 *
 * 采用"追加事件 + 状态投影"模型管理团队状态。
 * 所有状态变更通过 appendEvent 完成，状态由事件投影得出。
 * 状态迁移通过 reducer 校验，非法迁移被拒绝并记录审计事件。
 */

import type { Context } from '@deepseek-ai/cordis';
import {
  randomUUID,
} from 'node:crypto';
import type {
  TeamConfig,
  TeamState,
  TeamStatus,
  TeamEvent,
  TeamEventType,
  Task,
  TaskStatus,
  TaskResult,
  QualityResult,
  MemberConfig,
  InterventionCommand,
  LeaderAction,
  Issue,
} from './types';

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
  private workspaceLock: string | null = null;
  private disposed = false;

  // subagent provider 绑定（由 DSH 注入）
  private subagentProvider: unknown = null;

  constructor(ctx: Context, config: TeamConfig) {
    this.ctx = ctx;
    this.config = config;

    // 初始化状态投影
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

    // 记录初始事件
    this.appendEvent('team_created', { members: config.members });
    for (const member of config.members) {
      this.appendEvent('member_added', { memberId: member.id, member });
    }
  }

  // ===== 事件追加 =====

  private appendEvent(
    type: TeamEventType,
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

      case 'member_added':
        // 成员已在构造函数中添加
        break;

      case 'member_removed': {
        const memberId = event.data.memberId as string;
        this.state.members = this.state.members.filter(
          (m) => m.id !== memberId,
        );
        break;
      }

      case 'task_created': {
        const task = event.data.task as Task;
        this.state.tasks.push(task);
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
        // 产出物记录在任务结果中
        const taskId = event.taskId!;
        const artifacts = event.data.artifacts as string[];
        const task = this.state.tasks.find((t) => t.id === taskId);
        if (task && task.result) {
          task.result.artifacts.push(...artifacts);
        }
        break;
      }

      case 'message_sent':
        // 消息存储在事件流中，UI 从事件投影读取
        break;

      case 'user_intervention':
        // 用户介入记录在事件流中
        break;

      case 'error':
        // 错误记录在事件流中
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
      throw new Error(
        `Invalid team status transition: ${from} → ${to}`,
      );
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

  // ===== 工作区锁 =====

  /** 获取工作区写锁 */
  acquireWorkspaceLock(taskId: string): boolean {
    if (this.workspaceLock !== null) {
      return false;
    }
    this.workspaceLock = taskId;
    return true;
  }

  /** 释放工作区写锁 */
  releaseWorkspaceLock(taskId: string): void {
    if (this.workspaceLock === taskId) {
      this.workspaceLock = null;
    }
  }

  /** 检查工作区是否被锁定 */
  isWorkspaceLocked(): boolean {
    return this.workspaceLock !== null;
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

  // ===== Subagent 绑定 =====

  /** 绑定 DSH subagent provider（由插件入口注入） */
  bindSubagentProvider(provider: unknown): void {
    this.subagentProvider = provider;
  }

  /** 获取 subagent provider */
  getSubagentProvider(): unknown {
    return this.subagentProvider;
  }

  // ===== 清理 =====

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners = [];
    this.workspaceLock = null;
  }
}
