/**
 * Leader 计划器 — 受约束的输出 schema 校验
 *
 * Leader 不直接输出任意 JSON；只允许输出经过 schema 校验的动作：
 * create_task、unblock_task、request_review、request_test、
 * request_docs、report、ask_user。
 *
 * 计划器输出必须校验角色、依赖、任务数量、并发额度和预算。
 * 无效输出最多自动重试两次，仍失败则把团队置为 blocked。
 */

import type { LeaderAction, LeaderActionType, RoleId } from '../runtime/types';
import type { TeamState, Task } from '../runtime/types';

// ===== 常量 =====

const MAX_RETRIES = 2;
const MAX_TASKS_PER_PLAN = 20;
const VALID_ACTIONS: LeaderActionType[] = [
  'create_task',
  'unblock_task',
  'request_review',
  'request_test',
  'request_docs',
  'report',
  'ask_user',
];

const VALID_ROLES: RoleId[] = ['coder', 'reviewer', 'tester', 'docs'];

// ===== 校验结果 =====

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ===== 计划器 =====

export class LeaderPlanner {
  private maxConcurrent: number;

  constructor(maxConcurrent = 1) {
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * 校验 Leader 输出
   */
  validate(action: unknown, state: TeamState): ValidationResult {
    const errors: string[] = [];

    // 基本结构校验
    if (!action || typeof action !== 'object') {
      return { valid: false, errors: ['Action must be a JSON object'] };
    }

    const a = action as Record<string, unknown>;

    // type 字段
    const type = a.type as LeaderActionType;
    if (!type) {
      errors.push('Missing required field "type"');
      return { valid: false, errors };
    }
    if (!VALID_ACTIONS.includes(type)) {
      errors.push(
        `Invalid action type "${type}". Must be one of: ${VALID_ACTIONS.join(', ')}`,
      );
      return { valid: false, errors };
    }

    // reason 字段
    if (typeof a.reason !== 'string' || !a.reason.trim()) {
      errors.push('Missing or empty "reason" field');
    }

    // 按类型校验
    switch (type) {
      case 'create_task':
        this.validateCreateTask(a, state, errors);
        break;
      case 'unblock_task':
        this.validateUnblockTask(a, state, errors);
        break;
      case 'request_review':
      case 'request_test':
      case 'request_docs':
        this.validateRequestAction(a, state, errors);
        break;
      case 'report':
        if (typeof a.summary !== 'string' || !a.summary.trim()) {
          errors.push('Missing or empty "summary" for report action');
        }
        break;
      case 'ask_user':
        if (typeof a.question !== 'string' || !a.question.trim()) {
          errors.push('Missing or empty "question" for ask_user action');
        }
        break;
    }

    return { valid: errors.length === 0, errors };
  }

  private validateCreateTask(
    a: Record<string, unknown>,
    state: TeamState,
    errors: string[],
  ): void {
    const task = a.task as Record<string, unknown> | undefined;
    if (!task) {
      errors.push('Missing "task" field for create_task action');
      return;
    }

    // 标题
    if (typeof task.title !== 'string' || !task.title.trim()) {
      errors.push('Task title is required and must be non-empty');
    }

    // 描述
    if (typeof task.description !== 'string' || !task.description.trim()) {
      errors.push('Task description is required and must be non-empty');
    }

    // 角色
    const role = task.role as RoleId;
    if (!role || !VALID_ROLES.includes(role)) {
      errors.push(
        `Invalid or missing task role "${role}". Must be one of: ${VALID_ROLES.join(', ')}`,
      );
    }

    // 检查角色对应成员是否存在
    if (role && VALID_ROLES.includes(role)) {
      const hasMember = state.members.some((m) => m.role === role);
      if (!hasMember) {
        errors.push(`No member with role "${role}" available in team`);
      }
    }

    // 依赖
    const deps = task.dependencies as string[] | undefined;
    if (deps) {
      if (!Array.isArray(deps)) {
        errors.push('Task dependencies must be an array of task IDs');
      } else {
        for (const depId of deps) {
          if (typeof depId !== 'string') {
            errors.push(`Invalid dependency ID: ${depId}`);
            continue;
          }
          const dep = state.tasks.find((t) => t.id === depId);
          if (!dep) {
            errors.push(`Dependency task not found: ${depId}`);
          }
        }
      }
    }

    // 任务数量限制
    if (state.tasks.length >= MAX_TASKS_PER_PLAN) {
      errors.push(
        `Maximum task count (${MAX_TASKS_PER_PLAN}) reached`,
      );
    }

    // 并发额度检查 — 不能同时派发有依赖关系的任务
    const runningTasks = state.tasks.filter(
      (t) => t.status === 'running' || t.status === 'ready',
    );
    if (runningTasks.length >= this.maxConcurrent) {
      // 检查新任务是否依赖正在运行的任务
      if (deps && deps.length > 0) {
        const runningIds = new Set(runningTasks.map((t) => t.id));
        const hasRunningDep = deps.some((d) => runningIds.has(d));
        if (!hasRunningDep) {
          errors.push(
            `Cannot create task: concurrent limit (${this.maxConcurrent}) reached`,
          );
        }
      }
    }
  }

  private validateUnblockTask(
    a: Record<string, unknown>,
    state: TeamState,
    errors: string[],
  ): void {
    const taskId = a.taskId as string;
    if (!taskId) {
      errors.push('Missing "taskId" for unblock_task action');
      return;
    }
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) {
      errors.push(`Task not found: ${taskId}`);
      return;
    }
    if (task.status !== 'blocked') {
      errors.push(
        `Task ${taskId} is not blocked (status: ${task.status})`,
      );
    }
  }

  private validateRequestAction(
    a: Record<string, unknown>,
    state: TeamState,
    errors: string[],
  ): void {
    const taskId = a.taskId as string;
    if (!taskId) {
      errors.push('Missing "taskId" field');
      return;
    }
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) {
      errors.push(`Task not found: ${taskId}`);
      return;
    }
    // 请求审核/测试的任务必须是已完成的
    if (task.status !== 'passed' && task.status !== 'failed') {
      errors.push(
        `Task ${taskId} must be passed or failed to request review/test (status: ${task.status})`,
      );
    }
  }

  /**
   * 尝试解析 Leader 的 LLM 输出
   * 最多重试 MAX_RETRIES 次，仍失败则返回 null
   */
  parseLeaderOutput(
    raw: string,
    state: TeamState,
    retryFn?: () => Promise<string>,
  ): { action: LeaderAction | null; retries: number; errors: string[] } {
    let errors: string[] = [];
    let retries = 0;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // 尝试提取 JSON
      const jsonStr = this.extractJSON(raw);
      if (!jsonStr) {
        errors.push(
          `Attempt ${attempt + 1}: Output is not valid JSON`,
        );
        retries++;
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        errors.push(
          `Attempt ${attempt + 1}: Failed to parse JSON`,
        );
        retries++;
        continue;
      }

      const result = this.validate(parsed, state);
      if (result.valid) {
        return {
          action: parsed as LeaderAction,
          retries,
          errors: [],
        };
      }

      errors = result.errors;
      retries++;
    }

    return { action: null, retries, errors };
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
}
