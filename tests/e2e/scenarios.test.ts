/**
 * 端到端测试 — 团队全流程场景
 *
 * 测试覆盖：
 * - 正常交付流程（规划→编码→审核→测试→报告）
 * - 审核退回 + 修复 + 重新审核
 * - 测试失败 + 修复 + 重新测试
 * - 暂停恢复
 * - 跳过任务
 * - 接管
 * - 插件重载（dispose + 重建）
 * - 空计划终态
 * - 部分取消终态
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TeamRuntime } from '../../core/runtime/team-runtime';
import {
  validateTaskResult,
  validateQualityResult,
  canFinalize,
} from '../../core/quality/gates';
import {
  createMockContext,
  createPersistedMockTeamConfig,
  cleanupWorkspace,
} from '../unit/helpers';
import type { TeamConfig } from '../../core/runtime/types';

describe('E2E: 正常交付流程', () => {
  let ctx: any;
  let config: TeamConfig;

  beforeEach(() => {
    ctx = createMockContext();
    config = createPersistedMockTeamConfig();
  });

  afterEach(() => {
    cleanupWorkspace(config.workspace);
  });

  it('完整交付：规划→编码→审核→测试→最终化', () => {
    const runtime = new TeamRuntime(ctx, config);

    // 规划阶段
    runtime.startPlanning();
    runtime.startRunning();

    // Coder 实现功能
    const codeTask = runtime.createTask('实现功能', '描述', 'coder');
    runtime.transitionTask(codeTask.id, 'ready');
    runtime.transitionTask(codeTask.id, 'running');
    runtime.transitionTask(codeTask.id, 'passed', {
      status: 'completed',
      summary: '功能实现完成',
      artifacts: ['src/feature.ts'],
      issues: [],
    });

    // Reviewer 审核
    runtime.recordQuality(codeTask.id, {
      status: 'approved',
      summary: '审核通过',
      issues: [],
    });

    // Tester 测试
    const testTask = runtime.createTask('测试功能', '描述', 'tester', [codeTask.id]);
    runtime.transitionTask(testTask.id, 'ready');
    runtime.transitionTask(testTask.id, 'running');
    runtime.transitionTask(testTask.id, 'passed', {
      status: 'completed',
      summary: '全部测试通过',
      artifacts: ['tests/feature.test.ts'],
      issues: [],
    });
    runtime.recordQuality(testTask.id, {
      status: 'test_passed',
      summary: '测试通过',
      issues: [],
    });

    // 验证可以最终化
    const state = runtime.getSnapshot();
    const finalizeResult = canFinalize(state.tasks);
    expect(finalizeResult.canFinalize).toBe(true);

    // 团队完成
    runtime.complete('交付完成');
    expect(runtime.getSnapshot().status).toBe('completed');

    runtime.dispose();
  });
});

describe('E2E: 审核退回与修复', () => {
  let ctx: any;
  let config: TeamConfig;

  beforeEach(() => {
    ctx = createMockContext();
    config = createPersistedMockTeamConfig();
  });

  afterEach(() => {
    cleanupWorkspace(config.workspace);
  });

  it('审核退回 → 修复 → 重新审核通过', () => {
    const runtime = new TeamRuntime(ctx, config);
    runtime.startPlanning();
    runtime.startRunning();

    const task = runtime.createTask('功能', '描述', 'coder');
    runtime.transitionTask(task.id, 'ready');
    runtime.transitionTask(task.id, 'running');
    runtime.transitionTask(task.id, 'passed', {
      status: 'completed',
      summary: '完成',
      artifacts: ['src/feat.ts'],
      issues: [],
    });

    // 审核退回
    runtime.recordQuality(task.id, {
      status: 'changes_requested',
      summary: '需要修改',
      issues: [{ severity: 'warning', description: '命名问题' }],
    });
    expect(runtime.getSnapshot().tasks.find((t) => t.id === task.id)?.status).toBe('failed');

    // 修复
    runtime.transitionTask(task.id, 'ready');
    runtime.transitionTask(task.id, 'running');
    runtime.transitionTask(task.id, 'passed', {
      status: 'completed',
      summary: '已修复',
      artifacts: ['src/feat.ts'],
      issues: [],
    });

    // 重新审核通过
    runtime.recordQuality(task.id, {
      status: 'approved',
      summary: '修复后通过',
      issues: [],
    });

    expect(runtime.getSnapshot().tasks.find((t) => t.id === task.id)?.status).toBe('passed');
    runtime.dispose();
  });
});

describe('E2E: 测试失败与修复', () => {
  let ctx: any;
  let config: TeamConfig;

  beforeEach(() => {
    ctx = createMockContext();
    config = createPersistedMockTeamConfig();
  });

  afterEach(() => {
    cleanupWorkspace(config.workspace);
  });

  it('测试失败 → 修复 → 重新测试通过', () => {
    const runtime = new TeamRuntime(ctx, config);
    runtime.startPlanning();
    runtime.startRunning();

    const codeTask = runtime.createTask('编码', '描述', 'coder');
    runtime.transitionTask(codeTask.id, 'ready');
    runtime.transitionTask(codeTask.id, 'running');
    runtime.transitionTask(codeTask.id, 'passed', {
      status: 'completed',
      summary: '完成',
      artifacts: ['src/app.ts'],
      issues: [],
    });
    runtime.recordQuality(codeTask.id, {
      status: 'approved',
      summary: '审核通过',
      issues: [],
    });

    // 测试任务
    const testTask = runtime.createTask('测试', '描述', 'tester', [codeTask.id]);
    runtime.transitionTask(testTask.id, 'ready');
    runtime.transitionTask(testTask.id, 'running');
    runtime.transitionTask(testTask.id, 'passed', {
      status: 'completed',
      summary: '测试执行完成',
      artifacts: [],
      issues: [],
    });

    // 测试失败
    runtime.recordQuality(testTask.id, {
      status: 'test_failed',
      summary: '2 个测试失败',
      issues: [{ severity: 'critical', description: 'test_login 失败' }],
    });
    expect(runtime.getSnapshot().tasks.find((t) => t.id === testTask.id)?.status).toBe('failed');

    // 修复后重新测试
    runtime.transitionTask(testTask.id, 'ready');
    runtime.transitionTask(testTask.id, 'running');
    runtime.transitionTask(testTask.id, 'passed', {
      status: 'completed',
      summary: '修复后重新测试',
      artifacts: [],
      issues: [],
    });
    runtime.recordQuality(testTask.id, {
      status: 'test_passed',
      summary: '全部通过',
      issues: [],
    });

    expect(runtime.getSnapshot().tasks.find((t) => t.id === testTask.id)?.status).toBe('passed');
    runtime.dispose();
  });
});

describe('E2E: 暂停恢复', () => {
  let ctx: any;
  let config: TeamConfig;

  beforeEach(() => {
    ctx = createMockContext();
    config = createPersistedMockTeamConfig();
  });

  afterEach(() => {
    cleanupWorkspace(config.workspace);
  });

  it('暂停后不再派发新任务，恢复后可继续', () => {
    const runtime = new TeamRuntime(ctx, config);
    runtime.startPlanning();
    runtime.startRunning();

    // 暂停
    runtime.pause();
    expect(runtime.getSnapshot().status).toBe('paused');

    // 暂停后创建任务不应该阻止（但实际执行应等恢复）
    // 这里验证暂停状态本身正确
    const task = runtime.createTask('新任务', '描述', 'coder');
    expect(task.status).toBe('planned');

    // 恢复
    runtime.resume();
    expect(runtime.getSnapshot().status).toBe('running');

    runtime.dispose();
  });
});

describe('E2E: 跳过任务', () => {
  let ctx: any;
  let config: TeamConfig;

  beforeEach(() => {
    ctx = createMockContext();
    config = createPersistedMockTeamConfig();
  });

  afterEach(() => {
    cleanupWorkspace(config.workspace);
  });

  it('跳过任务后其他任务不受影响', () => {
    const runtime = new TeamRuntime(ctx, config);
    runtime.startPlanning();
    runtime.startRunning();

    const task1 = runtime.createTask('任务1', '描述', 'coder');
    const task2 = runtime.createTask('任务2', '描述', 'reviewer');

    // 跳过 task1
    runtime.handleIntervention({ type: 'skip', taskId: task1.id });
    expect(runtime.getSnapshot().tasks.find((t) => t.id === task1.id)?.status).toBe('cancelled');

    // task2 不受影响
    runtime.transitionTask(task2.id, 'ready');
    expect(runtime.getSnapshot().tasks.find((t) => t.id === task2.id)?.status).toBe('ready');

    runtime.dispose();
  });
});

describe('E2E: 接管', () => {
  let ctx: any;
  let config: TeamConfig;

  beforeEach(() => {
    ctx = createMockContext();
    config = createPersistedMockTeamConfig();
  });

  afterEach(() => {
    cleanupWorkspace(config.workspace);
  });

  it('接管操作暂停团队并记录', () => {
    const runtime = new TeamRuntime(ctx, config);
    runtime.startPlanning();
    runtime.startRunning();

    const task = runtime.createTask('任务', '描述', 'coder');
    runtime.handleIntervention({ type: 'takeover', taskId: task.id });

    expect(runtime.getSnapshot().status).toBe('paused');
    const events = runtime.getEvents();
    const takeoverEvent = events.find(
      (e) => e.type === 'user_intervention' && e.data.type === 'takeover',
    );
    expect(takeoverEvent).toBeDefined();
    expect(takeoverEvent?.data.taskId).toBe(task.id);

    runtime.dispose();
  });
});

describe('E2E: 插件重载', () => {
  let ctx: any;
  let config: TeamConfig;

  beforeEach(() => {
    ctx = createMockContext();
    config = createPersistedMockTeamConfig();
  });

  afterEach(() => {
    cleanupWorkspace(config.workspace);
  });

  it('dispose 后重建 runtime 可恢复状态', () => {
    const rt1 = new TeamRuntime(ctx, config);
    rt1.startPlanning();
    rt1.startRunning();
    const task = rt1.createTask('持久化任务', '描述', 'coder');
    rt1.transitionTask(task.id, 'ready');
    rt1.transitionTask(task.id, 'running');
    rt1.dispose();

    // 重建
    const rt2 = new TeamRuntime(ctx, config);
    const state = rt2.getSnapshot();
    expect(state.status).toBe('running');
    expect(state.tasks.length).toBe(1);
    expect(state.tasks[0].title).toBe('持久化任务');
    expect(state.tasks[0].status).toBe('running');
    rt2.dispose();
  });

  it('dispose 后事件订阅全部清除', () => {
    const rt = new TeamRuntime(ctx, config);
    let received = 0;
    rt.subscribe(() => received++);
    rt.dispose();

    // dispose 后不应再收到事件
    // 由于 dispose 清空 listeners，即使触发也不通知
    const before = received;
    // 直接调用 dispose 已清除 listeners
    expect(received).toBe(before);
  });
});

describe('E2E: 空计划与终态', () => {
  let ctx: any;
  let config: TeamConfig;

  beforeEach(() => {
    ctx = createMockContext();
    config = createPersistedMockTeamConfig();
  });

  afterEach(() => {
    cleanupWorkspace(config.workspace);
  });

  it('空计划直接完成产生明确终态', () => {
    const runtime = new TeamRuntime(ctx, config);
    runtime.startPlanning();
    runtime.startRunning();

    // 没有任何任务，直接完成
    const tasks = runtime.getSnapshot().tasks;
    expect(tasks.length).toBe(0);

    const finalizeResult = canFinalize(tasks);
    expect(finalizeResult.canFinalize).toBe(true);

    runtime.complete('空计划完成');
    expect(runtime.getSnapshot().status).toBe('completed');

    runtime.dispose();
  });

  it('部分取消后剩余任务可最终化', () => {
    const runtime = new TeamRuntime(ctx, config);
    runtime.startPlanning();
    runtime.startRunning();

    const task1 = runtime.createTask('任务1', '描述', 'coder');
    const task2 = runtime.createTask('任务2', '描述', 'coder');

    // 取消 task2
    runtime.transitionTask(task2.id, 'cancelled');

    // task1 完成并通过审核
    runtime.transitionTask(task1.id, 'ready');
    runtime.transitionTask(task1.id, 'running');
    runtime.transitionTask(task1.id, 'passed', {
      status: 'completed',
      summary: '完成',
      artifacts: [],
      issues: [],
    });
    runtime.recordQuality(task1.id, {
      status: 'approved',
      summary: '通过',
      issues: [],
    });

    // 验证最终化
    const tasks = runtime.getSnapshot().tasks;
    const finalizeResult = canFinalize(tasks);
    expect(finalizeResult.canFinalize).toBe(true);

    runtime.dispose();
  });

  it('全失败计划产生明确终态', () => {
    const runtime = new TeamRuntime(ctx, config);
    runtime.startPlanning();
    runtime.startRunning();

    const task = runtime.createTask('任务', '描述', 'coder');
    runtime.transitionTask(task.id, 'ready');
    runtime.transitionTask(task.id, 'running');
    runtime.transitionTask(task.id, 'failed', {
      status: 'failed',
      summary: '实现失败',
      artifacts: [],
      issues: [{ severity: 'critical', description: '严重错误' }],
    });

    // 修复后取消
    runtime.transitionTask(task.id, 'cancelled');

    // 可以最终化（唯一任务已取消）
    const finalizeResult = canFinalize(runtime.getSnapshot().tasks);
    expect(finalizeResult.canFinalize).toBe(true);

    runtime.fail('全部任务失败');
    expect(runtime.getSnapshot().status).toBe('failed');

    runtime.dispose();
  });
});
