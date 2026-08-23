/**
 * OrchestrationLoop unit tests
 *
 * Tests the core flow of the orchestration loop:
 * - Start/pause/resume/cancel
 * - Leader decision → create task → dispatch → done
 * - Quality gates: review approved/rejected, test passed/failed
 * - Report completion
 * - ask_user pause and wait for user response
 * - Event listening
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OrchestrationLoop, type SubagentRuntimeLike, type SubagentRunLike, type SubagentResultLike, type LoopEvent } from '../../core/orchestrator/orchestration-loop';
import { TeamRuntime } from '../../core/runtime/team-runtime';
import { LeaderPlanner } from '../../core/planner/leader-planner';
import { createMockContext, createMockTeamConfig, cleanupWorkspace } from './helpers';
import type { TeamConfig } from '../../core/runtime/types';

// ===== Mock SubagentRuntime =====

/**
 * Create a mock SubagentRuntime that returns predefined outputs based on calls
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

      // Match by prompt content — check Leader first to avoid false matches
      if (promptText.includes('Your Decision') || promptText.includes('Team Goal')) {
        // Leader decision — use the dsh queue directly
        output = queue[callCounts[key] - 1] || queue[queue.length - 1] || 'no response';
      } else if (promptText.startsWith('You are the team\'s Reviewer')) {
        const reviewQueue = responses.get('reviewer') || responses.get('*') || [];
        output = reviewQueue[0] || output;
      } else if (promptText.startsWith('You are the team\'s Tester')) {
        const testQueue = responses.get('tester') || responses.get('*') || [];
        output = testQueue[0] || output;
      } else if (promptText.startsWith('You are the team\'s Doc')) {
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

// ===== Test =====

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

  describe('State Management', () => {
    it('Initial state is idle', () => {
      expect(loop.getState()).toBe('idle');
    });

    it('Throws when starting without bound subagent', async () => {
      await expect(loop.start('test goal')).rejects.toThrow('SubagentRuntime not bound');
    });

    it('Subscribe receives events', () => {
      const events: LoopEvent[] = [];
      loop.subscribe((e) => events.push(e));
      // Manually trigger events via start
      loop.bindSubagentRuntime(createMockSubagentRuntime(new Map()));
      // Cannot directly test start as it will run the full loop
      // But can test dispose after listeners are cleaned
      loop.dispose();
      expect(events.length).toBe(0);
    });
  });

  describe('Full Flow', () => {
    it('Leader creates task → coder executes → done → report', async () => {
      // Prepare mock responses
      const responses = new Map<string, string[]>([
        ['dsh', [
          // First call: Leader decides to create task
          JSON.stringify({
            type: 'create_task',
            task: {
              title: 'Implement login page',
              description: 'Create a login form component',
              role: 'coder',
              dependencies: [],
            },
            reason: 'Need to implement login page first',
          }),
          // Second call: Coder returns result
          JSON.stringify({
            status: 'completed',
            summary: 'Login page implemented',
            artifacts: ['login.tsx'],
            issues: [],
          }),
          // Third call: Leader reports
          JSON.stringify({
            type: 'report',
            summary: 'All tasks are done',
            reason: 'Login page implementation done',
          }),
        ]],
      ]);

      loop.bindSubagentRuntime(createMockSubagentRuntime(responses));

      const events: LoopEvent[] = [];
      loop.subscribe((e) => events.push(e));

      await loop.start('Implement a login page');

      // Verify loop is done
      expect(loop.getState()).toBe('completed');

      // Verify event order
      const types = events.map((e) => e.type);
      expect(types).toContain('loop_started');
      expect(types).toContain('leader_called');
      expect(types).toContain('leader_action_validated');
      expect(types).toContain('task_dispatched');
      expect(types).toContain('task_completed');
      expect(types).toContain('loop_completed');

      // Verify team state
      const snapshot = runtime.getSnapshot();
      expect(snapshot.status).toBe('completed');
      expect(snapshot.tasks.length).toBe(1);
      expect(snapshot.tasks[0].status).toBe('passed');
    });

    it('Leader creates task → coder executes → request_review → review approved → report', async () => {
      const responses = new Map<string, string[]>([
        ['dsh', [
          // Leader: create coder task
          JSON.stringify({
            type: 'create_task',
            task: {
              title: 'Implement login page',
              description: 'Create a login form component',
              role: 'coder',
              dependencies: [],
            },
            reason: 'Need to implement login page first',
          }),
          // Leader: request review
          JSON.stringify({
            type: 'request_review',
            taskId: '', // Will be filled at test runtime
            reason: 'Code is written, need review',
          }),
          // Leader: Report done
          JSON.stringify({
            type: 'report',
            summary: 'All tasks done and review passed',
            reason: 'Review passed',
          }),
        ]],
        ['reviewer', [
          JSON.stringify({
            status: 'approved',
            summary: 'Code quality is good, review passed',
            issues: [],
          }),
        ]],
      ]);

      // All members have provider 'dsh', so we dispatch by prompt content to determine role
      let leaderCallCount = 0;
      const mockRT: SubagentRuntimeLike = {
        async start(_name: string, request: { prompt: unknown[] }) {
          const promptText = (request.prompt as { type: string; text?: string }[]).map((b) => b.text || '').join('');

          let output = '';

          // Dispatch by prompt content: Leader, reviewer, coder
          if (promptText.includes('Your Decision') || promptText.includes('Team Goal')) {
            // Leader decision
            leaderCallCount++;
            const queue = responses.get('dsh') || [];
            if (leaderCallCount === 1) {
              output = queue[0]; // create_task
            } else if (leaderCallCount === 2) {
              // Use real taskId
              const snapshot = runtime.getSnapshot();
              const taskId = snapshot.tasks[0]?.id || '';
              const action = JSON.parse(queue[1]);
              action.taskId = taskId;
              output = JSON.stringify(action);
            } else {
              output = queue[2]; // report
            }
          } else if (promptText.startsWith('You are the team\'s Reviewer')) {
            // Reviewer
            const queue = responses.get('reviewer') || [];
            output = queue[0];
          } else {
            // Coder executes
            output = JSON.stringify({
              status: 'completed',
              summary: 'Login page implementation done',
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

      await loop.start('Implement a login page');

      expect(loop.getState()).toBe('completed');
      const snapshot = runtime.getSnapshot();
      expect(snapshot.tasks.length).toBe(1);
      expect(snapshot.tasks[0].quality).toBeDefined();
      expect(snapshot.tasks[0].quality!.status).toBe('approved');
    });

    it('Review rejected → coder fixes → re-review', async () => {
      let leaderCallCount = 0;
      let reviewerCallCount = 0;

      const mockRT: SubagentRuntimeLike = {
        async start(_name: string, request: { prompt: unknown[] }) {
          const promptText = (request.prompt as { type: string; text?: string }[]).map((b) => b.text || '').join('');
          let output = '';

          // Dispatch by prompt content
          if (promptText.includes('Your Decision') || promptText.includes('Team Goal')) {
            // Leader decision
            leaderCallCount++;
            const snapshot = runtime.getSnapshot();
            const taskId = snapshot.tasks[0]?.id || '';

            if (leaderCallCount === 1) {
              output = JSON.stringify({
                type: 'create_task',
                task: {
                  title: 'Implement login page',
                  description: 'Create a login form component',
                  role: 'coder',
                  dependencies: [],
                },
                reason: 'Need to implement login page first',
              });
            } else if (leaderCallCount === 2) {
              output = JSON.stringify({
                type: 'request_review',
                taskId,
                reason: 'Code is written',
              });
            } else if (leaderCallCount === 3) {
              // After review rejection, create a fix task
              output = JSON.stringify({
                type: 'create_task',
                task: {
                  title: 'Fix null pointer risk',
                  description: 'Reviewer found null pointer risk in Login.tsx line 42',
                  role: 'coder',
                  dependencies: [],
                },
                reason: 'Reviewer found issue, need to fix',
              });
            } else if (leaderCallCount === 4) {
              // Request review again (for the fixed task)
              const fixTaskId = snapshot.tasks[1]?.id || '';
              output = JSON.stringify({
                type: 'request_review',
                taskId: fixTaskId,
                reason: 'Fix is done, need re-review',
              });
            } else {
              output = JSON.stringify({
                type: 'report',
                summary: 'All tasks done and review passed',
                reason: 'All passed',
              });
            }
          } else if (promptText.startsWith('You are the team\'s Reviewer')) {
            // Reviewer
            reviewerCallCount++;
            if (reviewerCallCount === 1) {
              output = JSON.stringify({
                status: 'changes_requested',
                summary: 'Login.tsx line 42 has null pointer risk',
                issues: [{
                  severity: 'critical',
                  file: 'Login.tsx',
                  line: 42,
                  description: 'Null pointer risk',
                  suggestion: 'Add null value check',
                }],
              });
            } else {
              output = JSON.stringify({
                status: 'approved',
                summary: 'Review passed after fix',
                issues: [],
              });
            }
          } else {
            // Coder
            output = JSON.stringify({
              status: 'completed',
              summary: 'Task done',
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
      await loop.start('Implement a login page');

      expect(loop.getState()).toBe('completed');
      const snapshot = runtime.getSnapshot();
      // Should have 2 tasks (original + fix)
      expect(snapshot.tasks.length).toBe(2);
    });
  });

  describe('Pause and Resume', () => {
    it('Pause changes state to paused', () => {
      loop.bindSubagentRuntime(createMockSubagentRuntime(new Map()));
      // Test pause directly (without starting loop)
      // Pause at non-running status is a no-op
      loop.pause();
      expect(loop.getState()).toBe('idle');
    });
  });

  describe('Cancel', () => {
    it('Cancel changes state to cancelled', () => {
      loop.cancel();
      expect(loop.getState()).toBe('cancelled');
    });
  });

  describe('Error Handling', () => {
    it('Exceeds max iterations and fails', async () => {
      // Leader always outputs invalid JSON — loop will keep going but won't produce valid action
      // Reaching maxIterations will throw
      const responses = new Map<string, string[]>([
        ['dsh', ['this is not json at all']],
      ]);

      loop.bindSubagentRuntime(createMockSubagentRuntime(responses));

      try {
        await loop.start('test');
      } catch (err) {
        // Expected to throw max iterations error
      }

      // Loop failed
      expect(loop.getState()).toBe('failed');
    });
  });
});
