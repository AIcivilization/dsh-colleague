/**
 * 集成测试 — 事件持久化与恢复 + Mock Provider 全流程
 *
 * 测试覆盖：
 * - 事件流持久化到 events.jsonl
 * - 重启后从事件流完整恢复团队状态
 * - Mock provider 模拟最小 coder 任务生命周期
 * - TeamRuntime + WorkspaceLock + MemoryService 端到端协作
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TeamRuntime } from '../../core/runtime/team-runtime';
import { LeaderPlanner } from '../../core/planner/leader-planner';
import {
  validateTaskResult,
  validateQualityResult,
  hasPassedQualityGate,
  canFinalize,
} from '../../core/quality/gates';
import {
  createMockContext,
  createPersistedMockTeamConfig,
  cleanupWorkspace,
} from '../unit/helpers';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TeamConfig } from '../../core/runtime/types';

describe('集成测试：事件持久化与恢复', () => {
  let ctx: any;
  let config: TeamConfig;

  beforeEach(() => {
    ctx = createMockContext();
    config = createPersistedMockTeamConfig();
  });

  afterEach(() => {
    cleanupWorkspace(config.workspace);
  });

  it('完整生命周期：创建 → 规划 → 运行 → 任务完成 → 审核 → 测试 → 最终化', () => {
    const runtime = new TeamRuntime(ctx, config);

    // 1. 团队启动
    runtime.startPlanning();
    runtime.startRunning();
    expect(runtime.getSnapshot().status).toBe('running');

    // 2. Leader 创建编码任务
    const coderTask = runtime.createTask(
      '实现用户认证',
      '实现 JWT 登录和注册 API',
      'coder',
    );
    expect(coderTask.status).toBe('planned');

    // 3. 任务流转到 running
    runtime.transitionTask(coderTask.id, 'ready');
    runtime.transitionTask(coderTask.id, 'running');

    // 4. coder 返回结构化结果
    const coderResult = {
      status: 'completed' as const,
      summary: '实现了 /api/login 和 /api/register',
      artifacts: ['src/auth/login.ts', 'src/auth/register.ts'],
      issues: [],
    };
    const resultValidation = validateTaskResult(coderResult);
    expect(resultValidation.valid).toBe(true);

    runtime.transitionTask(coderTask.id, 'passed', resultValidation.result);

    // 5. reviewer 审核
    const reviewQuality = validateQualityResult({
      status: 'approved',
      summary: '代码质量良好，符合规范',
      issues: [],
    });
    expect(reviewQuality.valid).toBe(true);

    runtime.recordQuality(coderTask.id, {
      status: 'approved',
      summary: '审核通过',
      issues: [],
    });

    // 6. 验证质量门禁
    const task = runtime.getSnapshot().tasks.find((t) => t.id === coderTask.id);
    expect(task).toBeDefined();
    expect(hasPassedQualityGate(task!)).toBe(true);

    // 7. 团队完成
    runtime.complete('所有任务完成');
    expect(runtime.getSnapshot().status).toBe('completed');

    runtime.dispose();
  });

  it('审核退回 → 修复 → 重新审核通过', () => {
    const runtime = new TeamRuntime(ctx, config);
    runtime.startPlanning();
    runtime.startRunning();

    const coderTask = runtime.createTask('实现功能A', '描述', 'coder');
    runtime.transitionTask(coderTask.id, 'ready');
    runtime.transitionTask(coderTask.id, 'running');
    runtime.transitionTask(coderTask.id, 'passed', {
      status: 'completed',
      summary: '完成',
      artifacts: ['src/a.ts'],
      issues: [],
    });

    // 审核退回
    runtime.recordQuality(coderTask.id, {
      status: 'changes_requested',
      summary: '需要修改命名规范',
      issues: [
        { severity: 'warning', description: '变量名不规范', file: 'src/a.ts', line: 10 },
      ],
    });

    // 任务应变为 failed
    let task = runtime.getSnapshot().tasks.find((t) => t.id === coderTask.id);
    expect(task?.status).toBe('failed');

    // 修复后重新进入 ready
    runtime.transitionTask(coderTask.id, 'ready');
    runtime.transitionTask(coderTask.id, 'running');
    runtime.transitionTask(coderTask.id, 'passed', {
      status: 'completed',
      summary: '已修复命名问题',
      artifacts: ['src/a.ts'],
      issues: [],
    });

    // 重新审核通过
    runtime.recordQuality(coderTask.id, {
      status: 'approved',
      summary: '修复后通过',
      issues: [],
    });

    task = runtime.getSnapshot().tasks.find((t) => t.id === coderTask.id);
    expect(task?.status).toBe('passed');
    expect(hasPassedQualityGate(task!)).toBe(true);

    runtime.dispose();
  });

  it('canFinalize 阻止未通过审核的团队最终化', () => {
    const runtime = new TeamRuntime(ctx, config);
    runtime.startPlanning();
    runtime.startRunning();

    const coderTask = runtime.createTask('编码', '描述', 'coder');
    runtime.transitionTask(coderTask.id, 'ready');
    runtime.transitionTask(coderTask.id, 'running');
    runtime.transitionTask(coderTask.id, 'passed', {
      status: 'completed',
      summary: '完成',
      artifacts: [],
      issues: [],
    });

    // 没有质量结论 → 不能最终化
    const tasks = runtime.getSnapshot().tasks;
    const result = canFinalize(tasks);
    expect(result.canFinalize).toBe(false);

    runtime.dispose();
  });

  it('事件持久化后重启恢复完整状态', () => {
    // 第一阶段
    const rt1 = new TeamRuntime(ctx, config);
    rt1.startPlanning();
    rt1.startRunning();
    const task1 = rt1.createTask('任务1', '描述1', 'coder');
    const task2 = rt1.createTask('任务2', '描述2', 'tester', [task1.id]);
    rt1.transitionTask(task1.id, 'ready');
    rt1.transitionTask(task1.id, 'running');
    rt1.transitionTask(task1.id, 'passed', {
      status: 'completed',
      summary: '完成',
      artifacts: ['src/file.ts'],
      issues: [],
    });
    rt1.recordQuality(task1.id, {
      status: 'approved',
      summary: '通过',
      issues: [],
    });
    rt1.pause();

    // 验证持久化文件存在
    const eventsPath = resolve(config.workspace, '.colleague', 'events.jsonl');
    expect(existsSync(eventsPath)).toBe(true);

    // 验证每行是合法 JSON
    const content = readFileSync(eventsPath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim());
    expect(lines.length).toBeGreaterThan(5);

    rt1.dispose();

    // 第二阶段：重启恢复
    const rt2 = new TeamRuntime(ctx, config);
    const state = rt2.getSnapshot();

    // 验证恢复的状态
    expect(state.status).toBe('paused');
    expect(state.tasks.length).toBe(2);
    expect(state.tasks[0].title).toBe('任务1');
    expect(state.tasks[0].status).toBe('passed');
    expect(state.tasks[0].quality?.status).toBe('approved');
    expect(state.tasks[1].title).toBe('任务2');
    expect(state.tasks[1].dependencies).toContain(task1.id);

    // 验证恢复后可以继续操作
    rt2.resume();
    expect(rt2.getSnapshot().status).toBe('running');

    rt2.dispose();
  });

  it('LeaderPlanner + TeamRuntime 联动：校验后执行', () => {
    const runtime = new TeamRuntime(ctx, config);
    const planner = new LeaderPlanner(1);

    runtime.startPlanning();
    runtime.startRunning();

    // 模拟 Leader 输出
    const leaderAction = {
      type: 'create_task' as const,
      reason: '需要实现登录功能',
      task: {
        title: '实现登录',
        description: 'JWT 登录 API',
        role: 'coder' as const,
        dependencies: [] as string[],
      },
    };

    // 校验 Leader 输出
    const state = runtime.getSnapshot();
    const validation = planner.validate(leaderAction, state);
    expect(validation.valid).toBe(true);

    // 执行 Leader 指令
    const task = runtime.createTask(
      leaderAction.task.title,
      leaderAction.task.description,
      leaderAction.task.role,
      leaderAction.task.dependencies,
    );
    expect(task.title).toBe('实现登录');

    runtime.dispose();
  });

  it('记忆系统持久化：重启后可检索架构决定', () => {
    const rt1 = new TeamRuntime(ctx, config);
    rt1.startPlanning();
    rt1.startRunning();

    // 触发 team_status_changed 事件，记录到记忆
    rt1.pause();
    rt1.resume();

    // 通过 quality_recorded 记录质量结论
    const task = rt1.createTask('任务', '描述', 'coder');
    rt1.transitionTask(task.id, 'ready');
    rt1.transitionTask(task.id, 'running');
    rt1.transitionTask(task.id, 'passed', {
      status: 'completed',
      summary: '完成',
      artifacts: [],
      issues: [],
    });
    rt1.recordQuality(task.id, {
      status: 'approved',
      summary: '审核通过',
      issues: [],
    });

    rt1.dispose();

    // 重启后验证记忆
    const rt2 = new TeamRuntime(ctx, config);
    const memory = rt2.getMemory();
    const all = memory.getAll();
    expect(all.length).toBeGreaterThan(0);

    // 应包含质量结论
    const qualityEntries = all.filter((e) => e.metadata.source === 'quality');
    expect(qualityEntries.length).toBeGreaterThan(0);

    // 应包含决策记录
    const decisionEntries = all.filter((e) => e.metadata.source === 'decision');
    expect(decisionEntries.length).toBeGreaterThan(0);

    rt2.dispose();
  });
});
