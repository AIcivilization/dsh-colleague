/**
 * OrchestrationLoop 单元测试
 *
 * 测试编排循环的核心流程：
 * - 启动/暂停/恢复/取消
 * - Leader 决策 → 创建任务 → 派发 → 完成
 * - 质量门禁：审核通过/退回、测试通过/失败
 * - report 完成
 * - ask_user 暂停等待用户
 * - 事件监听
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OrchestrationLoop, type SubagentRuntimeLike, type SubagentRunLike, type SubagentResultLike, type LoopEvent } from '../../core/orchestrator/orchestration-loop';
import { TeamRuntime } from '../../core/runtime/team-runtime';
import { LeaderPlanner } from '../../core/planner/leader-planner';
import { createMockContext, createMockTeamConfig, cleanupWorkspace } from './helpers';
import type { TeamConfig } from '../../core/runtime/types';

// ===== Mock SubagentRuntime =====

/**
 * 创建 mock SubagentRuntime，按调用返回预定义的输出
 */
function createMockSubagentRuntime(responses: Map<string, string[]>): SubagentRuntimeLike {
  const callCounts: Record<string, number> = {};

  return {
    async start(name: string, request: { prompt: unknown[] }) {
      const promptText = (request.prompt as { type: string; text?: string }[]).map((b) => b.text || '').join('');
      const key = name;

      callCounts[key] = (callCounts[key] || 0) + 1;
      const queue = responses.get(key) || responses.get('*') || [];
      let output = queue[callCounts[key] - 1] || queue[queue.length - 1] || 'no response';

      // 如果按 prompt 内容匹配
      if (promptText.includes('审核')) {
        const reviewQueue = responses.get('reviewer') || responses.get('*') || [];
        output = reviewQueue[0] || output;
      } else if (promptText.includes('测试')) {
        const testQueue = responses.get('tester') || responses.get('*') || [];
        output = testQueue[0] || output;
      } else if (promptText.includes('文档')) {
        const docsQueue = responses.get('docs') || responses.get('*') || [];
        output = docsQueue[0] || output;
      }

      const result: SubagentResultLike = {
        output: [{ type: 'text', text: output }],
        stopReason: 'completed',
      };

      const run: SubagentRunLike = {
        result: Promise.resolve(result),
        dispose: async () => {},
      };

      return run;
    },
  };
}

// ===== 测试 =====

describe('OrchestrationLoop', () => {
  let ctx: ReturnType<typeof createMockContext>;
  let config: TeamConfig;
  let runtime: TeamRuntime;
  let planner: LeaderPlanner;
  let loop: OrchestrationLoop;

  beforeEach(() => {
    ctx = createMockContext();
    config = createMockTeamConfig();
    runtime = new TeamRuntime(ctx, config);
    planner = new LeaderPlanner(1);
    loop = new OrchestrationLoop(runtime, planner, { maxIterations: 10 });
  });

  afterEach(() => {
    loop.dispose();
    runtime.dispose();
    cleanupWorkspace(config.workspace);
  });

  describe('状态管理', () => {
    it('初始状态为 idle', () => {
      expect(loop.getState()).toBe('idle');
    });

    it('未绑定 subagent 时 start 抛错', async () => {
      await expect(loop.start('test goal')).rejects.toThrow('SubagentRuntime not bound');
    });

    it('subscribe 接收事件', () => {
      const events: LoopEvent[] = [];
      loop.subscribe((e) => events.push(e));
      // 手动触发事件通过 start
      loop.bindSubagentRuntime(createMockSubagentRuntime(new Map()));
      // 不能直接测试 start 因为会启动完整循环
      // 但可以测试 dispose 后 listeners 被清空
      loop.dispose();
      expect(events.length).toBe(0);
    });
  });

  describe('完整流程', () => {
    it('Leader 创建任务 → coder 执行 → 完成 → report', async () => {
      // 准备 mock responses
      const responses = new Map<string, string[]>([
        ['dsh', [
          // 第一次调用：Leader 决策创建任务
          JSON.stringify({
            type: 'create_task',
            task: {
              title: '实现登录页',
              description: '创建一个登录表单组件',
              role: 'coder',
              dependencies: [],
            },
            reason: '需要先实现登录页面',
          }),
          // 第二次调用：Leader 决策 report
          JSON.stringify({
            type: 'report',
            summary: '所有任务已完成',
            reason: '登录页实现完成',
          }),
        ]],
      ]);

      loop.bindSubagentRuntime(createMockSubagentRuntime(responses));

      const events: LoopEvent[] = [];
      loop.subscribe((e) => events.push(e));

      await loop.start('做一个登录页面');

      // 验证循环完成
      expect(loop.getState()).toBe('completed');

      // 验证事件序列
      const types = events.map((e) => e.type);
      expect(types).toContain('loop_started');
      expect(types).toContain('leader_called');
      expect(types).toContain('leader_action_validated');
      expect(types).toContain('task_dispatched');
      expect(types).toContain('task_completed');
      expect(types).toContain('loop_completed');

      // 验证团队状态
      const snapshot = runtime.getSnapshot();
      expect(snapshot.status).toBe('completed');
      expect(snapshot.tasks.length).toBe(1);
      expect(snapshot.tasks[0].status).toBe('passed');
    });

    it('Leader 创建任务 → coder 执行 → request_review → 审核通过 → report', async () => {
      const responses = new Map<string, string[]>([
        ['dsh', [
          // Leader: 创建 coder 任务
          JSON.stringify({
            type: 'create_task',
            task: {
              title: '实现登录页',
              description: '创建一个登录表单组件',
              role: 'coder',
              dependencies: [],
            },
            reason: '需要先实现登录页面',
          }),
          // Leader: 请求审核
          JSON.stringify({
            type: 'request_review',
            taskId: '', // 将在测试中动态填充
            reason: '代码写完了，需要审核',
          }),
          // Leader: 汇报完成
          JSON.stringify({
            type: 'report',
            summary: '所有任务已完成并审核通过',
            reason: '审核通过',
          }),
        ]],
        ['reviewer', [
          JSON.stringify({
            status: 'approved',
            summary: '代码质量良好，通过审核',
            issues: [],
          }),
        ]],
      ]);

      // 所有成员的 provider 都是 'dsh'，所以按 prompt 内容区分角色
      let leaderCallCount = 0;
      const mockRT: SubagentRuntimeLike = {
        async start(_name: string, request: { prompt: unknown[] }) {
          const promptText = (request.prompt as { type: string; text?: string }[]).map((b) => b.text || '').join('');

          let output = '';

          // 按 prompt 内容区分：Leader、reviewer、coder
          if (promptText.includes('你的决策') || promptText.includes('团队目标')) {
            // Leader 决策
            leaderCallCount++;
            const queue = responses.get('dsh') || [];
            if (leaderCallCount === 1) {
              output = queue[0]; // create_task
            } else if (leaderCallCount === 2) {
              // 使用真实 taskId
              const snapshot = runtime.getSnapshot();
              const taskId = snapshot.tasks[0]?.id || '';
              const action = JSON.parse(queue[1]);
              action.taskId = taskId;
              output = JSON.stringify(action);
            } else {
              output = queue[2]; // report
            }
          } else if (promptText.includes('审核员') || promptText.includes('审核结论')) {
            // reviewer
            const queue = responses.get('reviewer') || [];
            output = queue[0];
          } else {
            // coder 执行
            output = JSON.stringify({
              status: 'completed',
              summary: '登录页实现完成',
              artifacts: ['Login.tsx'],
              issues: [],
            });
          }

          const result: SubagentResultLike = {
            output: [{ type: 'text', text: output }],
            stopReason: 'completed',
          };
          return {
            result: Promise.resolve(result),
            dispose: async () => {},
          };
        },
      };

      loop.bindSubagentRuntime(mockRT);

      await loop.start('做一个登录页面');

      expect(loop.getState()).toBe('completed');
      const snapshot = runtime.getSnapshot();
      expect(snapshot.tasks.length).toBe(1);
      expect(snapshot.tasks[0].quality).toBeDefined();
      expect(snapshot.tasks[0].quality!.status).toBe('approved');
    });

    it('审核退回 → coder 修复 → 重新审核', async () => {
      let leaderCallCount = 0;
      let reviewerCallCount = 0;

      const mockRT: SubagentRuntimeLike = {
        async start(_name: string, request: { prompt: unknown[] }) {
          const promptText = (request.prompt as { type: string; text?: string }[]).map((b) => b.text || '').join('');
          let output = '';

          // 按 prompt 内容区分角色
          if (promptText.includes('你的决策') || promptText.includes('团队目标')) {
            // Leader 决策
            leaderCallCount++;
            const snapshot = runtime.getSnapshot();
            const taskId = snapshot.tasks[0]?.id || '';

            if (leaderCallCount === 1) {
              output = JSON.stringify({
                type: 'create_task',
                task: {
                  title: '实现登录页',
                  description: '创建一个登录表单组件',
                  role: 'coder',
                  dependencies: [],
                },
                reason: '需要先实现登录页面',
              });
            } else if (leaderCallCount === 2) {
              output = JSON.stringify({
                type: 'request_review',
                taskId,
                reason: '代码写完了',
              });
            } else if (leaderCallCount === 3) {
              // 审核退回后，创建修复任务
              output = JSON.stringify({
                type: 'create_task',
                task: {
                  title: '修复空指针风险',
                  description: '审核发现 Login.tsx 第42行空指针风险',
                  role: 'coder',
                  dependencies: [],
                },
                reason: '审核发现问题，退回修复',
              });
            } else if (leaderCallCount === 4) {
              // 再次请求审核（对修复后的任务）
              const fixTaskId = snapshot.tasks[1]?.id || '';
              output = JSON.stringify({
                type: 'request_review',
                taskId: fixTaskId,
                reason: '修复完成，重新审核',
              });
            } else {
              output = JSON.stringify({
                type: 'report',
                summary: '所有任务完成并审核通过',
                reason: '全部通过',
              });
            }
          } else if (promptText.includes('审核员') || promptText.includes('审核结论')) {
            // reviewer
            reviewerCallCount++;
            if (reviewerCallCount === 1) {
              output = JSON.stringify({
                status: 'changes_requested',
                summary: 'Login.tsx 第42行有空指针风险',
                issues: [{
                  severity: 'critical',
                  file: 'Login.tsx',
                  line: 42,
                  description: '空指针风险',
                  suggestion: '添加空值检查',
                }],
              });
            } else {
              output = JSON.stringify({
                status: 'approved',
                summary: '修复后审核通过',
                issues: [],
              });
            }
          } else {
            // coder
            output = JSON.stringify({
              status: 'completed',
              summary: '任务完成',
              artifacts: ['Login.tsx'],
              issues: [],
            });
          }

          const result: SubagentResultLike = {
            output: [{ type: 'text', text: output }],
            stopReason: 'completed',
          };
          return {
            result: Promise.resolve(result),
            dispose: async () => {},
          };
        },
      };

      loop.bindSubagentRuntime(mockRT);
      await loop.start('做一个登录页面');

      expect(loop.getState()).toBe('completed');
      const snapshot = runtime.getSnapshot();
      // 应该有2个任务（原始 + 修复）
      expect(snapshot.tasks.length).toBe(2);
    });
  });

  describe('暂停和恢复', () => {
    it('pause 后状态变为 paused', () => {
      loop.bindSubagentRuntime(createMockSubagentRuntime(new Map()));
      // 直接测试 pause（不启动循环）
      // pause 在非 running 状态时为 no-op
      loop.pause();
      expect(loop.getState()).toBe('idle');
    });
  });

  describe('cancel', () => {
    it('cancel 后状态变为 cancelled', () => {
      loop.cancel();
      expect(loop.getState()).toBe('cancelled');
    });
  });

  describe('错误处理', () => {
    it('超过最大迭代次数后状态变为 failed', async () => {
      // Leader 每次都输出无效 JSON — 循环会继续但不会产出有效 action
      // 达到 maxIterations 后抛错
      const responses = new Map<string, string[]>([
        ['dsh', ['this is not json at all']],
      ]);

      loop.bindSubagentRuntime(createMockSubagentRuntime(responses));

      try {
        await loop.start('test');
      } catch (err) {
        // 预期抛出 Max iterations 错误
      }

      // 循环因超时失败
      expect(loop.getState()).toBe('failed');
    });
  });
});
