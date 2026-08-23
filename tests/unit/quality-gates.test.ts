/**
 * Quality gates — unit tests
 *
 * Covers:
 * - validateTaskResult: valid/invalid result validation
 * - validateQualityResult: valid/invalid quality result validation
 * - hasPassedQualityGate: gate pass/fail checks
 * - needsRevision: revision needed checks
 * - canFinalize: team finalization checks
 * - validateDocsInput: docs task input validation
 */

import { describe, it, expect } from 'vitest';
import {
  validateTaskResult,
  validateQualityResult,
  hasPassedQualityGate,
  needsRevision,
  canFinalize,
  validateDocsInput,
} from '../../core/quality/gates';
import type { Task, QualityResult, TaskResult } from '../../core/runtime/types';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-001',
    title: 'Test Task',
    description: 'Description',
    assigneeId: 'coder-01',
    role: 'coder',
    status: 'running',
    dependencies: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeQuality(overrides: Partial<QualityResult> = {}): QualityResult {
  return {
    status: 'approved',
    issues: [],
    summary: 'Passed',
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeTaskResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    status: 'completed',
    summary: 'Done',
    artifacts: [],
    issues: [],
    ...overrides,
  };
}

describe('validateTaskResult', () => {
  it('valid result passes validation', () => {
    const result = validateTaskResult(makeTaskResult());
    expect(result.valid).toBe(true);
    expect(result.result).toBeDefined();
    expect(result.result!.status).toBe('completed');
  });

  it('non-object input is rejected', () => {
    expect(validateTaskResult(null).valid).toBe(false);
    expect(validateTaskResult('string').valid).toBe(false);
    expect(validateTaskResult(42).valid).toBe(false);
  });

  it('missing status field is rejected', () => {
    const result = validateTaskResult({ summary: 'Description', artifacts: [], issues: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('status'))).toBe(true);
  });

  it('invalid status value is rejected', () => {
    const result = validateTaskResult({ status: 'unknown', summary: 'Description' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('status'))).toBe(true);
  });

  it('missing summary is rejected', () => {
    const result = validateTaskResult({ status: 'completed' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('summary'))).toBe(true);
  });

  it('empty summary is rejected', () => {
    const result = validateTaskResult({ status: 'completed', summary: '  ' });
    expect(result.valid).toBe(false);
  });

  it('artifacts not an array is rejected', () => {
    const result = validateTaskResult({
      status: 'completed',
      summary: 'Description',
      artifacts: 'not-an-array',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('artifacts'))).toBe(true);
  });

  it('invalid issue item is rejected', () => {
    const result = validateTaskResult({
      status: 'completed',
      summary: 'Description',
      issues: [
        { severity: 'critical', description: 'Issue1' },
        { description: 'Missing severity' },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Issue 1'))).toBe(true);
  });

  it('blocked result includes blockedReason', () => {
    const result = validateTaskResult({
      status: 'blocked',
      summary: 'Blocked',
      blockedReason: 'Waiting for dependency',
    });
    expect(result.valid).toBe(true);
    expect(result.result!.blockedReason).toBe('Waiting for dependency');
  });
});

describe('validateQualityResult', () => {
  it('valid quality result passes validation', () => {
    const result = validateQualityResult({
      status: 'approved',
      summary: 'Review passed',
      issues: [],
    });
    expect(result.valid).toBe(true);
    expect(result.result!.status).toBe('approved');
  });

  it('invalid status is rejected', () => {
    const result = validateQualityResult({
      status: 'unknown',
      summary: 'Description',
    });
    expect(result.valid).toBe(false);
  });

  it('missing summary is rejected', () => {
    const result = validateQualityResult({ status: 'approved' });
    expect(result.valid).toBe(false);
  });

  it('non-object input is rejected', () => {
    expect(validateQualityResult(null).valid).toBe(false);
    expect(validateQualityResult(undefined).valid).toBe(false);
  });

  it('changes_requested status is valid', () => {
    const result = validateQualityResult({
      status: 'changes_requested',
      summary: 'Changes needed',
      issues: [
        { severity: 'warning', description: 'Naming issue' },
      ],
    });
    expect(result.valid).toBe(true);
  });
});

describe('hasPassedQualityGate', () => {
  it('approved status passes gate', () => {
    const task = makeTask({ quality: makeQuality({ status: 'approved' }) });
    expect(hasPassedQualityGate(task)).toBe(true);
  });

  it('test_passed status passes gate', () => {
    const task = makeTask({ quality: makeQuality({ status: 'test_passed' }) });
    expect(hasPassedQualityGate(task)).toBe(true);
  });

  it('changes_requested does not pass gate', () => {
    const task = makeTask({ quality: makeQuality({ status: 'changes_requested' }) });
    expect(hasPassedQualityGate(task)).toBe(false);
  });

  it('test_failed does not pass gate', () => {
    const task = makeTask({ quality: makeQuality({ status: 'test_failed' }) });
    expect(hasPassedQualityGate(task)).toBe(false);
  });

  it('no quality result does not pass gate', () => {
    const task = makeTask({ quality: undefined });
    expect(hasPassedQualityGate(task)).toBe(false);
  });
});

describe('needsRevision', () => {
  it('changes_requested needs revision', () => {
    const task = makeTask({ quality: makeQuality({ status: 'changes_requested' }) });
    expect(needsRevision(task)).toBe(true);
  });

  it('test_failed needs revision', () => {
    const task = makeTask({ quality: makeQuality({ status: 'test_failed' }) });
    expect(needsRevision(task)).toBe(true);
  });

  it('approved does not need revision', () => {
    const task = makeTask({ quality: makeQuality({ status: 'approved' }) });
    expect(needsRevision(task)).toBe(false);
  });

  it('no quality result does not need revision', () => {
    const task = makeTask({ quality: undefined });
    expect(needsRevision(task)).toBe(false);
  });
});

describe('canFinalize', () => {
  it('all tasks passed — can finalize', () => {
    const tasks: Task[] = [
      makeTask({
        id: 't1',
        role: 'coder',
        status: 'passed',
        quality: makeQuality({ status: 'approved' }),
      }),
      makeTask({
        id: 't2',
        role: 'reviewer',
        status: 'passed',
      }),
      makeTask({
        id: 't3',
        role: 'tester',
        status: 'passed',
      }),
    ];
    const result = canFinalize(tasks);
    expect(result.canFinalize).toBe(true);
    expect(result.blockers.length).toBe(0);
  });

  it('coder task not passed — cannot finalize', () => {
    const tasks: Task[] = [
      makeTask({
        id: 't1',
        role: 'coder',
        status: 'running',
      }),
    ];
    const result = canFinalize(tasks);
    expect(result.canFinalize).toBe(false);
    expect(result.blockers.length).toBe(1);
  });

  it('coder task passed but quality gate not passed — cannot finalize', () => {
    const tasks: Task[] = [
      makeTask({
        id: 't1',
        role: 'coder',
        status: 'passed',
        quality: makeQuality({ status: 'changes_requested' }),
      }),
    ];
    const result = canFinalize(tasks);
    expect(result.canFinalize).toBe(false);
    expect(result.blockers.some((b) => b.includes('quality gate'))).toBe(true);
  });

  it('reviewer task not done — cannot finalize', () => {
    const tasks: Task[] = [
      makeTask({
        id: 't1',
        role: 'coder',
        status: 'passed',
        quality: makeQuality({ status: 'approved' }),
      }),
      makeTask({
        id: 't2',
        role: 'reviewer',
        status: 'running',
      }),
    ];
    const result = canFinalize(tasks);
    expect(result.canFinalize).toBe(false);
    expect(result.blockers.some((b) => b.includes('Review'))).toBe(true);
  });

  it('tester task not done — cannot finalize', () => {
    const tasks: Task[] = [
      makeTask({
        id: 't1',
        role: 'coder',
        status: 'passed',
        quality: makeQuality({ status: 'approved' }),
      }),
      makeTask({
        id: 't2',
        role: 'tester',
        status: 'failed',
      }),
    ];
    const result = canFinalize(tasks);
    expect(result.canFinalize).toBe(false);
    expect(result.blockers.some((b) => b.includes('Test'))).toBe(true);
  });

  it('cancelled tasks are skipped', () => {
    const tasks: Task[] = [
      makeTask({
        id: 't1',
        role: 'coder',
        status: 'cancelled',
      }),
    ];
    const result = canFinalize(tasks);
    expect(result.canFinalize).toBe(true);
  });
});

describe('validateDocsInput', () => {
  it('non-docs task is rejected', () => {
    const docsTask = makeTask({ role: 'coder' });
    const result = validateDocsInput(docsTask, []);
    expect(result.valid).toBe(false);
  });

  it('all coder tasks passed — docs task is valid', () => {
    const docsTask = makeTask({ id: 'docs-1', role: 'docs' });
    const allTasks: Task[] = [
      makeTask({
        id: 'coder-1',
        role: 'coder',
        status: 'passed',
        quality: makeQuality({ status: 'approved' }),
      }),
    ];
    const result = validateDocsInput(docsTask, allTasks);
    expect(result.valid).toBe(true);
  });

  it('coder task not passed — docs task is invalid', () => {
    const docsTask = makeTask({ id: 'docs-1', role: 'docs' });
    const allTasks: Task[] = [
      makeTask({
        id: 'coder-1',
        role: 'coder',
        status: 'running',
      }),
    ];
    const result = validateDocsInput(docsTask, allTasks);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('not passed quality gate'))).toBe(true);
  });

  it('cancelled coder task does not block docs', () => {
    const docsTask = makeTask({ id: 'docs-1', role: 'docs' });
    const allTasks: Task[] = [
      makeTask({
        id: 'coder-1',
        role: 'coder',
        status: 'cancelled',
      }),
    ];
    const result = validateDocsInput(docsTask, allTasks);
    expect(result.valid).toBe(true);
  });
});
