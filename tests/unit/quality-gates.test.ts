/**
 * quality gate gate single unitTest
 *
 * Testcover cover：
 * - validateTaskResult：Legal/Illegalconclusion resultValidation
 * - validateQualityResult：Legal/Illegalquality conclusion conclusionValidation
 * - hasPassedQualityGate：gate gatePassedjudge break
 * - needsRevision：fixneedrequest judge break
 * - canFinalize：teamfinalize check check
 * - validateDocsInput：text documenttaskinputValidation
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
  it('Legalconclusion resultPassedValidation', () => {
    const result = validateTaskResult(makeTaskResult());
    expect(result.valid).toBe(true);
    expect(result.result).toBeDefined();
    expect(result.result!.status).toBe('completed');
  });

  it('Non-objectinputRejected', () => {
    expect(validateTaskResult(null).valid).toBe(false);
    expect(validateTaskResult('string').valid).toBe(false);
    expect(validateTaskResult(42).valid).toBe(false);
  });

  it('Missing status fieldRejected', () => {
    const result = validateTaskResult({ summary: 'Description', artifacts: [], issues: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('status'))).toBe(true);
  });

  it('Illegal status valueRejected', () => {
    const result = validateTaskResult({ status: 'unknown', summary: 'Description' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('status'))).toBe(true);
  });

  it('Missing summary Rejected', () => {
    const result = validateTaskResult({ status: 'completed' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('summary'))).toBe(true);
  });

  it('empty summary Rejected', () => {
    const result = validateTaskResult({ status: 'completed', summary: '  ' });
    expect(result.valid).toBe(false);
  });

  it('artifacts not data groupRejected', () => {
    const result = validateTaskResult({
      status: 'completed',
      summary: 'Description',
      artifacts: 'not-an-array',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('artifacts'))).toBe(true);
  });

  it('issues ininvaliditem itemRejected', () => {
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

  it('blocked conclusion result include blockedReason', () => {
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
  it('Legalquality conclusion conclusionPassedValidation', () => {
    const result = validateQualityResult({
      status: 'approved',
      summary: 'ReviewPassed',
      issues: [],
    });
    expect(result.valid).toBe(true);
    expect(result.result!.status).toBe('approved');
  });

  it('Illegal status Rejected', () => {
    const result = validateQualityResult({
      status: 'unknown',
      summary: 'Description',
    });
    expect(result.valid).toBe(false);
  });

  it('Missing summary Rejected', () => {
    const result = validateQualityResult({ status: 'approved' });
    expect(result.valid).toBe(false);
  });

  it('Non-objectinputRejected', () => {
    expect(validateQualityResult(null).valid).toBe(false);
    expect(validateQualityResult(undefined).valid).toBe(false);
  });

  it('changes_requested statusLegal', () => {
    const result = validateQualityResult({
      status: 'changes_requested',
      summary: 'Changes needed',
      issues: [
        { severity: 'warning', description: 'namingIssue' },
      ],
    });
    expect(result.valid).toBe(true);
  });
});

describe('hasPassedQualityGate', () => {
  it('approved statusPassedgate gate', () => {
    const task = makeTask({ quality: makeQuality({ status: 'approved' }) });
    expect(hasPassedQualityGate(task)).toBe(true);
  });

  it('test_passed statusPassedgate gate', () => {
    const task = makeTask({ quality: makeQuality({ status: 'test_passed' }) });
    expect(hasPassedQualityGate(task)).toBe(true);
  });

  it('changes_requested notPassedgate gate', () => {
    const task = makeTask({ quality: makeQuality({ status: 'changes_requested' }) });
    expect(hasPassedQualityGate(task)).toBe(false);
  });

  it('test_failed notPassedgate gate', () => {
    const task = makeTask({ quality: makeQuality({ status: 'test_failed' }) });
    expect(hasPassedQualityGate(task)).toBe(false);
  });

  it('no quality conclusion conclusionnotPassedgate gate', () => {
    const task = makeTask({ quality: undefined });
    expect(hasPassedQualityGate(task)).toBe(false);
  });
});

describe('needsRevision', () => {
  it('changes_requested Needfix', () => {
    const task = makeTask({ quality: makeQuality({ status: 'changes_requested' }) });
    expect(needsRevision(task)).toBe(true);
  });

  it('test_failed Needfix', () => {
    const task = makeTask({ quality: makeQuality({ status: 'test_failed' }) });
    expect(needsRevision(task)).toBe(true);
  });

  it('approved notNeedfix', () => {
    const task = makeTask({ quality: makeQuality({ status: 'approved' }) });
    expect(needsRevision(task)).toBe(false);
  });

  it('no quality conclusion conclusionnotNeedfix', () => {
    const task = makeTask({ quality: undefined });
    expect(needsRevision(task)).toBe(false);
  });
});

describe('canFinalize', () => {
  it('all hastaskPassedthencanfinalize', () => {
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

  it('coder tasknotPassedthencannotfinalize', () => {
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

  it('coder taskPassedbut quality gatenotPassedthencannotfinalize', () => {
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

  it('reviewer tasknotDonethencannotfinalize', () => {
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

  it('tester tasknotDonethencannotfinalize', () => {
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

  it('cancelled taskbeskip', () => {
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
  it('not docs taskRejected', () => {
    const docsTask = makeTask({ role: 'coder' });
    const result = validateDocsInput(docsTask, []);
    expect(result.valid).toBe(false);
  });

  it('all has coder taskhasPassedwhen docs taskLegal', () => {
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

  it('coder tasknotPassedwhen docs taskIllegal', () => {
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

  it('cancelled coder tasknotblocked docs', () => {
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
