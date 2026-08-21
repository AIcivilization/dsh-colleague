/**
 * 质量门禁单元测试
 *
 * 测试覆盖：
 * - validateTaskResult：合法/非法结果校验
 * - validateQualityResult：合法/非法质量结论校验
 * - hasPassedQualityGate：门禁通过判断
 * - needsRevision：修复需求判断
 * - canFinalize：团队最终化检查
 * - validateDocsInput：文档任务输入校验
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
    title: '测试任务',
    description: '描述',
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
    summary: '通过',
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeTaskResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    status: 'completed',
    summary: '完成',
    artifacts: [],
    issues: [],
    ...overrides,
  };
}

describe('validateTaskResult', () => {
  it('合法结果通过校验', () => {
    const result = validateTaskResult(makeTaskResult());
    expect(result.valid).toBe(true);
    expect(result.result).toBeDefined();
    expect(result.result!.status).toBe('completed');
  });

  it('非对象输入被拒绝', () => {
    expect(validateTaskResult(null).valid).toBe(false);
    expect(validateTaskResult('string').valid).toBe(false);
    expect(validateTaskResult(42).valid).toBe(false);
  });

  it('缺少 status 字段被拒绝', () => {
    const result = validateTaskResult({ summary: '描述', artifacts: [], issues: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('status'))).toBe(true);
  });

  it('非法 status 值被拒绝', () => {
    const result = validateTaskResult({ status: 'unknown', summary: '描述' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('status'))).toBe(true);
  });

  it('缺少 summary 被拒绝', () => {
    const result = validateTaskResult({ status: 'completed' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('summary'))).toBe(true);
  });

  it('空 summary 被拒绝', () => {
    const result = validateTaskResult({ status: 'completed', summary: '  ' });
    expect(result.valid).toBe(false);
  });

  it('artifacts 非数组被拒绝', () => {
    const result = validateTaskResult({
      status: 'completed',
      summary: '描述',
      artifacts: 'not-an-array',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('artifacts'))).toBe(true);
  });

  it('issues 中无效条目被拒绝', () => {
    const result = validateTaskResult({
      status: 'completed',
      summary: '描述',
      issues: [
        { severity: 'critical', description: '问题1' },
        { description: '缺少 severity' },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Issue 1'))).toBe(true);
  });

  it('blocked 结果包含 blockedReason', () => {
    const result = validateTaskResult({
      status: 'blocked',
      summary: '被阻塞',
      blockedReason: '等待依赖',
    });
    expect(result.valid).toBe(true);
    expect(result.result!.blockedReason).toBe('等待依赖');
  });
});

describe('validateQualityResult', () => {
  it('合法质量结论通过校验', () => {
    const result = validateQualityResult({
      status: 'approved',
      summary: '审核通过',
      issues: [],
    });
    expect(result.valid).toBe(true);
    expect(result.result!.status).toBe('approved');
  });

  it('非法 status 被拒绝', () => {
    const result = validateQualityResult({
      status: 'unknown',
      summary: '描述',
    });
    expect(result.valid).toBe(false);
  });

  it('缺少 summary 被拒绝', () => {
    const result = validateQualityResult({ status: 'approved' });
    expect(result.valid).toBe(false);
  });

  it('非对象输入被拒绝', () => {
    expect(validateQualityResult(null).valid).toBe(false);
    expect(validateQualityResult(undefined).valid).toBe(false);
  });

  it('changes_requested 状态合法', () => {
    const result = validateQualityResult({
      status: 'changes_requested',
      summary: '需要修改',
      issues: [
        { severity: 'warning', description: '命名问题' },
      ],
    });
    expect(result.valid).toBe(true);
  });
});

describe('hasPassedQualityGate', () => {
  it('approved 状态通过门禁', () => {
    const task = makeTask({ quality: makeQuality({ status: 'approved' }) });
    expect(hasPassedQualityGate(task)).toBe(true);
  });

  it('test_passed 状态通过门禁', () => {
    const task = makeTask({ quality: makeQuality({ status: 'test_passed' }) });
    expect(hasPassedQualityGate(task)).toBe(true);
  });

  it('changes_requested 不通过门禁', () => {
    const task = makeTask({ quality: makeQuality({ status: 'changes_requested' }) });
    expect(hasPassedQualityGate(task)).toBe(false);
  });

  it('test_failed 不通过门禁', () => {
    const task = makeTask({ quality: makeQuality({ status: 'test_failed' }) });
    expect(hasPassedQualityGate(task)).toBe(false);
  });

  it('无质量结论不通过门禁', () => {
    const task = makeTask({ quality: undefined });
    expect(hasPassedQualityGate(task)).toBe(false);
  });
});

describe('needsRevision', () => {
  it('changes_requested 需要修复', () => {
    const task = makeTask({ quality: makeQuality({ status: 'changes_requested' }) });
    expect(needsRevision(task)).toBe(true);
  });

  it('test_failed 需要修复', () => {
    const task = makeTask({ quality: makeQuality({ status: 'test_failed' }) });
    expect(needsRevision(task)).toBe(true);
  });

  it('approved 不需要修复', () => {
    const task = makeTask({ quality: makeQuality({ status: 'approved' }) });
    expect(needsRevision(task)).toBe(false);
  });

  it('无质量结论不需要修复', () => {
    const task = makeTask({ quality: undefined });
    expect(needsRevision(task)).toBe(false);
  });
});

describe('canFinalize', () => {
  it('所有任务通过则可最终化', () => {
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

  it('coder 任务未通过则不可最终化', () => {
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

  it('coder 任务通过但质量门未通过则不可最终化', () => {
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

  it('reviewer 任务未完成则不可最终化', () => {
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

  it('tester 任务未完成则不可最终化', () => {
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

  it('cancelled 任务被跳过', () => {
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
  it('非 docs 任务被拒绝', () => {
    const docsTask = makeTask({ role: 'coder' });
    const result = validateDocsInput(docsTask, []);
    expect(result.valid).toBe(false);
  });

  it('所有 coder 任务已通过时 docs 任务合法', () => {
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

  it('coder 任务未通过时 docs 任务非法', () => {
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

  it('cancelled coder 任务不阻塞 docs', () => {
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
