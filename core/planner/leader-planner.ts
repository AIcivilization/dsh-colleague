/**
 * Leader planner — constrained output schema validation
 *
 * The Leader does not output arbitrary JSON; it only outputs schema-validated actions:
 * create_task, unblock_task, request_review, request_test,
 * request_docs, report, ask_user.
 *
 * Planner output must validate role, dependencies, task count, concurrency limits, and budget.
 * Invalid output retries up to 2 times automatically. If still failing, the team is set to blocked.
 */

import type { LeaderAction, LeaderActionType, RoleId } from '../runtime/types';
import type { TeamState, Task } from '../runtime/types';

// ===== Constants =====

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

// ===== Validation result =====

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ===== Planner =====

export class LeaderPlanner {
  private maxConcurrent: number;

  constructor(maxConcurrent = 1) {
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * Validate Leader output
   */
  validate(action: unknown, state: TeamState): ValidationResult {
    const errors: string[] = [];

    // Basic structure validation
    if (!action || typeof action !== 'object') {
      return { valid: false, errors: ['Action must be a JSON object'] };
    }

    const a = action as Record<string, unknown>;

    // type field
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

    // reason field
    if (typeof a.reason !== 'string' || !a.reason.trim()) {
      errors.push('Missing or empty "reason" field');
    }

    // Validate by type
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

    // Title
    if (typeof task.title !== 'string' || !task.title.trim()) {
      errors.push('Task title is required and must be non-empty');
    }

    // Description
    if (typeof task.description !== 'string' || !task.description.trim()) {
      errors.push('Task description is required and must be non-empty');
    }

    // Role
    const role = task.role as RoleId;
    if (!role || !VALID_ROLES.includes(role)) {
      errors.push(
        `Invalid or missing task role "${role}". Must be one of: ${VALID_ROLES.join(', ')}`,
      );
    }

    // Check that a member with the role exists
    if (role && VALID_ROLES.includes(role)) {
      const hasMember = state.members.some((m) => m.role === role);
      if (!hasMember) {
        errors.push(`No member with role "${role}" available in team`);
      }
    }

    // Dependencies
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

    // Task count limit
    if (state.tasks.length >= MAX_TASKS_PER_PLAN) {
      errors.push(
        `Maximum task count (${MAX_TASKS_PER_PLAN}) reached`,
      );
    }

    // Concurrency limit check — cannot dispatch tasks with dependency relationships simultaneously
    const runningTasks = state.tasks.filter(
      (t) => t.status === 'running' || t.status === 'ready',
    );
    if (runningTasks.length >= this.maxConcurrent) {
      // Check if new task depends on a running task
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
    // Tasks requesting review/test must be completed
    if (task.status !== 'passed' && task.status !== 'failed') {
      errors.push(
        `Task ${taskId} must be passed or failed to request review/test (status: ${task.status})`,
      );
    }
  }

  /**
   * Attempt to parse the Leader's LLM output
   * Retries up to MAX_RETRIES times. Returns null if still failing.
   */
  async parseLeaderOutput(
    raw: string,
    state: TeamState,
    retryFn?: () => Promise<string>,
  ): Promise<{ action: LeaderAction | null; retries: number; errors: string[] }> {
    let errors: string[] = [];
    let retries = 0;
    let currentRaw = raw;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // Attempt to extract JSON
      const jsonStr = this.extractJSON(currentRaw);
      if (!jsonStr) {
        errors.push(
          `Attempt ${attempt + 1}: Output is not valid JSON`,
        );
        retries++;
        // If retry function available, get new output and continue
        if (retryFn && attempt < MAX_RETRIES) {
          currentRaw = await retryFn();
        }
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
        if (retryFn && attempt < MAX_RETRIES) {
          currentRaw = await retryFn();
        }
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
      // If retry function available, get new output for next iteration
      if (retryFn && attempt < MAX_RETRIES) {
        currentRaw = await retryFn();
      }
    }

    return { action: null, retries, errors };
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
}
