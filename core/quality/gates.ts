/**
 * 质量门禁 — 统一结构化结果协议
 *
 * 为 coder、reviewer、tester、docs 定义统一结构化结果协议。
 * 结果包含：状态、摘要、产出文件、问题列表、测试命令、测试结果和阻塞原因。
 *
 * Reviewer 的 changes_requested、Tester 的 failed 必须阻止最终交付。
 * Docs 任务只读取已通过质量门的产出物。
 */

import type {
  TaskResult,
  QualityResult,
  QualityStatus,
  Issue,
  Task,
  TaskStatus,
} from '../runtime/types';

// ===== 结果校验 =====

export function validateTaskResult(raw: unknown): {
  valid: boolean;
  result?: TaskResult;
  errors: string[];
} {
  const errors: string[] = [];

  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: ['Result must be a JSON object'] };
  }

  const r = raw as Record<string, unknown>;

  // status
  const status = r.status as string;
  if (!status || !['completed', 'failed', 'blocked'].includes(status)) {
    errors.push('Missing or invalid "status" field');
  }

  // summary
  if (typeof r.summary !== 'string' || !r.summary.trim()) {
    errors.push('Missing or empty "summary" field');
  }

  // artifacts
  const artifacts = r.artifacts;
  if (artifacts && !Array.isArray(artifacts)) {
    errors.push('"artifacts" must be an array');
  }

  // issues
  const issues = r.issues;
  if (issues) {
    if (!Array.isArray(issues)) {
      errors.push('"issues" must be an array');
    } else {
      issues.forEach((issue, i) => {
        const issueErrors = validateIssue(issue);
        if (issueErrors.length > 0) {
          errors.push(`Issue ${i}: ${issueErrors.join(', ')}`);
        }
      });
    }
  }

  // testCommand
  if (r.testCommand && typeof r.testCommand !== 'string') {
    errors.push('"testCommand" must be a string');
  }

  // testOutput
  if (r.testOutput && typeof r.testOutput !== 'string') {
    errors.push('"testOutput" must be a string');
  }

  // blockedReason
  if (r.blockedReason && typeof r.blockedReason !== 'string') {
    errors.push('"blockedReason" must be a string');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    result: {
      status: status as TaskResult['status'],
      summary: r.summary as string,
      artifacts: (r.artifacts as string[]) || [],
      issues: (r.issues as Issue[]) || [],
      testCommand: r.testCommand as string | undefined,
      testOutput: r.testOutput as string | undefined,
      blockedReason: r.blockedReason as string | undefined,
    },
  };
}

function validateIssue(raw: unknown): string[] {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object') {
    return ['Issue must be a JSON object'];
  }

  const issue = raw as Record<string, unknown>;

  const severity = issue.severity as string;
  if (!severity || !['critical', 'warning', 'suggestion'].includes(severity)) {
    errors.push('Missing or invalid "severity"');
  }

  if (typeof issue.description !== 'string' || !issue.description.trim()) {
    errors.push('Missing or empty "description"');
  }

  return errors;
}

// ===== 质量结论校验 =====

export function validateQualityResult(raw: unknown): {
  valid: boolean;
  result?: QualityResult;
  errors: string[];
} {
  const errors: string[] = [];

  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: ['Quality result must be a JSON object'] };
  }

  const r = raw as Record<string, unknown>;

  const status = r.status as string;
  if (
    !status ||
    !['pending', 'approved', 'changes_requested', 'test_passed', 'test_failed'].includes(status)
  ) {
    errors.push('Missing or invalid "status" field');
  }

  if (typeof r.summary !== 'string' || !r.summary.trim()) {
    errors.push('Missing or empty "summary" field');
  }

  const issues = r.issues;
  if (issues && !Array.isArray(issues)) {
    errors.push('"issues" must be an array');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    result: {
      status: status as QualityStatus,
      reviewerId: r.reviewerId as string | undefined,
      issues: (r.issues as Issue[]) || [],
      summary: r.summary as string,
      timestamp: Date.now(),
    },
  };
}

// ===== 质量门禁规则 =====

/**
 * 检查任务是否通过了质量门禁
 */
export function hasPassedQualityGate(task: Task): boolean {
  if (!task.quality) return false;
  return (
    task.quality.status === 'approved' ||
    task.quality.status === 'test_passed'
  );
}

/**
 * 检查任务是否需要修复
 */
export function needsRevision(task: Task): boolean {
  if (!task.quality) return false;
  return (
    task.quality.status === 'changes_requested' ||
    task.quality.status === 'test_failed'
  );
}

/**
 * 检查团队是否可以进入最终报告
 * 所有编码任务必须通过审核和测试
 */
export function canFinalize(tasks: Task[]): {
  canFinalize: boolean;
  blockers: string[];
} {
  const blockers: string[] = [];

  for (const task of tasks) {
    // 跳过已取消的任务
    if (task.status === 'cancelled') continue;

    // 编码任务必须通过质量门禁
    if (task.role === 'coder') {
      if (task.status !== 'passed') {
        blockers.push(
          `Coder task "${task.title}" has not passed (status: ${task.status})`,
        );
        continue;
      }
      if (!hasPassedQualityGate(task)) {
        blockers.push(
          `Coder task "${task.title}" has not passed quality gate`,
        );
      }
    }

    // 审核任务必须完成
    if (task.role === 'reviewer' && task.status !== 'passed') {
      blockers.push(
        `Review task "${task.title}" has not passed (status: ${task.status})`,
      );
    }

    // 测试任务必须完成
    if (task.role === 'tester' && task.status !== 'passed') {
      blockers.push(
        `Test task "${task.title}" has not passed (status: ${task.status})`,
      );
    }
  }

  return { canFinalize: blockers.length === 0, blockers };
}

/**
 * 检查文档任务是否只读取已通过质量门的产出物
 */
export function validateDocsInput(
  docsTask: Task,
  allTasks: Task[],
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (docsTask.role !== 'docs') {
    return { valid: false, errors: ['Task must be a docs task'] };
  }

  // 获取所有编码任务的产出物
  for (const task of allTasks) {
    if (task.role === 'coder' && task.status !== 'cancelled') {
      if (task.status !== 'passed') {
        errors.push(
          `Cannot write docs: coder task "${task.title}" has not passed quality gate`,
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
