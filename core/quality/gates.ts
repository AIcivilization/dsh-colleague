/**
 * Quality gates — unified structured result protocol
 *
 * Defines a unified structured result protocol for coder, reviewer, tester, and docs.
 * Results include: status, summary, artifacts, issues, test command, test output, and block reason.
 *
 * Reviewer's changes_requested and Tester's failed must block final delivery.
 * Failed coder tasks block unless a subsequent fix task has passed.
 * A fix task is detected via dependencies OR via title prefix "Fix " combined
 * with a reference to the failed task's id (first 8 chars) in title/description.
 * Docs tasks only read artifacts that have passed quality gates.
 */
import type {
  TaskResult,
  QualityResult,
  QualityStatus,
  Issue,
  Task,
  TaskStatus,
} from '../runtime/types';

// ===== Result validation =====

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

// ===== Quality result validation =====

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

// ===== Quality gate rules =====

/**
 * Check if a task has passed the quality gate
 */
export function hasPassedQualityGate(task: Task): boolean {
  if (!task.quality) return false;
  return (
    task.quality.status === 'approved' ||
    task.quality.status === 'test_passed'
  );
}

/**
 * Check if a task needs revision
 */
export function needsRevision(task: Task): boolean {
  if (!task.quality) return false;
  return (
    task.quality.status === 'changes_requested' ||
    task.quality.status === 'test_failed'
  );
}

/**
 * Check if the team can proceed to final report.
 * All coding tasks must pass review and testing.
 * Failed coder tasks block unless a subsequent fix task has passed.
 */
export function canFinalize(tasks: Task[]): {
  canFinalize: boolean;
  blockers: string[];
} {
  const blockers: string[] = [];

  // Build set of tasks that have been "fixed" — a passed coder task
  // that depends on the failed task, or shares a title prefix
  const fixedTaskIds = new Set<string>();
  for (const t of tasks) {
    if (t.role === 'coder' && t.status === 'passed') {
      for (const depId of t.dependencies) {
        fixedTaskIds.add(depId);
      }
      // Also check title-based matching: a "Fix ..." task fixes the original
      // failed task only if its title or description references the failed
      // task's id (first 8 chars) — prevents unrelated fix tasks from
      // unblocking all failures
      if (t.title.toLowerCase().startsWith('fix ')) {
        const fixText = `${t.title} ${t.description ?? ''}`.toLowerCase();
        for (const orig of tasks) {
          if (orig.role === 'coder' && orig.status === 'failed') {
            const idPrefix = orig.id.slice(0, 8).toLowerCase();
            if (fixText.includes(idPrefix)) {
              fixedTaskIds.add(orig.id);
            }
          }
        }
      }
    }
  }

  for (const task of tasks) {
    // Skip cancelled tasks
    if (task.status === 'cancelled') continue;

    // Skip failed coder tasks that have been fixed by a subsequent task
    if (task.role === 'coder' && task.status === 'failed' && fixedTaskIds.has(task.id)) continue;

    // Coding tasks must be in a terminal state
    if (task.role === 'coder') {
      if (task.status !== 'passed') {
        blockers.push(
          `Coder task "${task.title}" has not passed (status: ${task.status})`,
        );
        continue;
      }
      // If quality gate was run, it must have passed
      // If no quality gate was run (no review step), allow pass
      if (task.quality && !hasPassedQualityGate(task)) {
        blockers.push(
          `Coder task "${task.title}" has not passed quality gate`,
        );
      }
    }

    // Review tasks must be completed
    if (task.role === 'reviewer' && task.status !== 'passed') {
      blockers.push(
        `Review task "${task.title}" has not passed (status: ${task.status})`,
      );
    }

    // Test tasks must be completed
    if (task.role === 'tester' && task.status !== 'passed') {
      blockers.push(
        `Test task "${task.title}" has not passed (status: ${task.status})`,
      );
    }
  }

  return { canFinalize: blockers.length === 0, blockers };
}

/**
 * Check that docs tasks only read artifacts that have passed quality gates
 */
export function validateDocsInput(
  docsTask: Task,
  allTasks: Task[],
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (docsTask.role !== 'docs') {
    return { valid: false, errors: ['Task must be a docs task'] };
  }

  // Get all coding task artifacts
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
