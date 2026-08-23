/**
 * LeaderPlanner unit tests
 *
 * Test coverage:
 * - Output schema validation (create_task / unblock_task / request_* / report / ask_user)
 * - Dependency validation (non-existent dependencies, loop dependencies)
 * - Concurrency budget validation
 * - JSON extraction and parsing (direct JSON, code blocks, no JSON)
 * - Retry mechanism
 * - reason field must be non-empty
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LeaderPlanner } from '../../core/planner/leader-planner';
import type { TeamState, Task, MemberConfig } from '../../core/runtime/types';

function makeMembers(): MemberConfig[] {
  return [
    { id: 'leader-01', name: 'Lead', role: 'leader', provider: 'dsh-sdk', slotId: 0 },
    { id: 'coder-01', name: 'Coder', role: 'coder', provider: 'dsh-sdk', slotId: 1 },
    { id: 'reviewer-01', name: 'Reviewer', role: 'reviewer', provider: 'dsh-sdk', slotId: 2 },
    { id: 'tester-01', name: 'Tester', role: 'tester', provider: 'dsh-sdk', slotId: 3 },
    { id: 'docs-01', name: 'Doc Writer', role: 'docs', provider: 'dsh-sdk', slotId: 4 },
  ];
}

function makeState(tasks: Task[] = []): TeamState {
  return {
    id: 'test-team',
    name: 'Test Team',
    status: 'running',
    members: makeMembers(),
    tasks,
    events: [],
    workspace: require('node:os').tmpdir(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-001',
    title: 'Test Task',
    description: 'Description',
    assigneeId: 'coder-01',
    role: 'coder',
    status: 'planned',
    dependencies: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('LeaderPlanner', () => {
  let planner: LeaderPlanner;

  beforeEach(() => {
    planner = new LeaderPlanner(1);
  });

  describe('create_task Validation', () => {
    it('valid create_task passes', () => {
      const action = {
        type: 'create_task',
        reason: 'Need to implement login',
        task: {
          title: 'Implement login',
          description: 'Implement user login API',
          role: 'coder',
          dependencies: [],
        },
      };
      const result = planner.validate(action, makeState());
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('missing task field is rejected', () => {
      const action = {
        type: 'create_task',
        reason: 'Need to implement',
      };
      const result = planner.validate(action, makeState());
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('"task"'))).toBe(true);
    });

    it('missing title is rejected', () => {
      const action = {
        type: 'create_task',
        reason: 'Need to implement',
        task: { description: 'Description', role: 'coder', dependencies: [] },
      };
      const result = planner.validate(action, makeState());
      expect(result.valid).toBe(false);
    });

    it('invalid role is rejected', () => {
      const action = {
        type: 'create_task',
        reason: 'Need to implement',
        task: {
          title: 'Title',
          description: 'Description',
          role: 'leader',
          dependencies: [],
        },
      };
      const result = planner.validate(action, makeState());
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('role'))).toBe(true);
    });

    it('role with no matching member is rejected', () => {
      const action = {
        type: 'create_task',
        reason: 'Need to implement',
        task: {
          title: 'Title',
          description: 'Description',
          role: 'tester',
          dependencies: [],
        },
      };
      // no tester member
      const state = makeState();
      state.members = state.members.filter((m) => m.role !== 'tester');
      const result = planner.validate(action, state);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('No member with role'))).toBe(true);
    });

    it('non-existent dependency is rejected', () => {
      const action = {
        type: 'create_task',
        reason: 'Need to implement',
        task: {
          title: 'Title',
          description: 'Description',
          role: 'coder',
          dependencies: ['nonexistent-id'],
        },
      };
      const result = planner.validate(action, makeState());
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Dependency task not found'))).toBe(true);
    });

    it('existing dependency passes', () => {
      const existingTask = makeTask({ id: 'task-001', status: 'passed' });
      const action = {
        type: 'create_task',
        reason: 'Need to implement',
        task: {
          title: 'Title',
          description: 'Description',
          role: 'coder',
          dependencies: ['task-001'],
        },
      };
      const result = planner.validate(action, makeState([existingTask]));
      expect(result.valid).toBe(true);
    });
  });

  describe('Concurrency budget validation', () => {
    it('running task with new non-dependent task exceeds concurrency limit', () => {
      const runningTask = makeTask({
        id: 'task-001',
        status: 'running',
      });
      const passedTask = makeTask({
        id: 'task-002',
        status: 'passed',
      });
      const action = {
        type: 'create_task',
        reason: 'Need to implement',
        task: {
          title: 'New task',
          description: 'Description',
          role: 'coder',
          // depends on task-002 (done, not running), triggers concurrency limit
          dependencies: ['task-002'],
        },
      };
      const result = planner.validate(action, makeState([runningTask, passedTask]));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('concurrent limit'))).toBe(true);
    });

    it('running task with new no-dependency task is valid (no concurrency check)', () => {
      const runningTask = makeTask({
        id: 'task-001',
        status: 'running',
      });
      const action = {
        type: 'create_task',
        reason: 'Need to implement',
        task: {
          title: 'New task',
          description: 'Description',
          role: 'coder',
          dependencies: [],
        },
      };
      // no dependency means no concurrency check (before implementation)
      const result = planner.validate(action, makeState([runningTask]));
      expect(result.valid).toBe(true);
    });

    it('running task with new dependent task is valid', () => {
      const runningTask = makeTask({
        id: 'task-001',
        status: 'running',
      });
      const action = {
        type: 'create_task',
        reason: 'Need to implement',
        task: {
          title: 'Follow-up task',
          description: 'Description',
          role: 'coder',
          dependencies: ['task-001'],
        },
      };
      const result = planner.validate(action, makeState([runningTask]));
      expect(result.valid).toBe(true);
    });

    it('maxConcurrent=2 allows second concurrent task', () => {
      const planner2 = new LeaderPlanner(2);
      const runningTask = makeTask({
        id: 'task-001',
        status: 'running',
      });
      const action = {
        type: 'create_task',
        reason: 'Need to implement',
        task: {
          title: 'New task',
          description: 'Description',
          role: 'coder',
          dependencies: [],
        },
      };
      const result = planner2.validate(action, makeState([runningTask]));
      expect(result.valid).toBe(true);
    });
  });

  describe('unblock_task Validation', () => {
    it('valid unblock_task passes', () => {
      const blockedTask = makeTask({ id: 'task-001', status: 'blocked' });
      const action = {
        type: 'unblock_task',
        reason: 'dependencies are done',
        taskId: 'task-001',
      };
      const result = planner.validate(action, makeState([blockedTask]));
      expect(result.valid).toBe(true);
    });

    it('missing taskId is rejected', () => {
      const action = {
        type: 'unblock_task',
        reason: 'Need unblock',
      };
      const result = planner.validate(action, makeState());
      expect(result.valid).toBe(false);
    });

    it('non-existent task is rejected', () => {
      const action = {
        type: 'unblock_task',
        reason: 'Need unblock',
        taskId: 'nonexistent',
      };
      const result = planner.validate(action, makeState());
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('not found'))).toBe(true);
    });

    it('non-blocked task is rejected', () => {
      const runningTask = makeTask({ id: 'task-001', status: 'running' });
      const action = {
        type: 'unblock_task',
        reason: 'Need unblock',
        taskId: 'task-001',
      };
      const result = planner.validate(action, makeState([runningTask]));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('not blocked'))).toBe(true);
    });
  });

  describe('request_review / request_test / request_docs Validation', () => {
    it('valid request_review passes', () => {
      const passedTask = makeTask({ id: 'task-001', status: 'passed' });
      const action = {
        type: 'request_review',
        reason: 'Need review',
        taskId: 'task-001',
      };
      const result = planner.validate(action, makeState([passedTask]));
      expect(result.valid).toBe(true);
    });

    it('task not done when request_test is rejected', () => {
      const runningTask = makeTask({ id: 'task-001', status: 'running' });
      const action = {
        type: 'request_test',
        reason: 'Need test',
        taskId: 'task-001',
      };
      const result = planner.validate(action, makeState([runningTask]));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('passed or failed'))).toBe(true);
    });

    it('missing taskId is rejected', () => {
      const action = {
        type: 'request_review',
        reason: 'Need review',
      };
      const result = planner.validate(action, makeState());
      expect(result.valid).toBe(false);
    });
  });

  describe('report Validation', () => {
    it('valid report passes', () => {
      const action = {
        type: 'report',
        reason: 'Report done',
        summary: 'All tasks are done',
      };
      const result = planner.validate(action, makeState());
      expect(result.valid).toBe(true);
    });

    it('missing summary is rejected', () => {
      const action = {
        type: 'report',
        reason: 'Report',
      };
      const result = planner.validate(action, makeState());
      expect(result.valid).toBe(false);
    });
  });

  describe('ask_user Validation', () => {
    it('valid ask_user passes', () => {
      const action = {
        type: 'ask_user',
        reason: 'Need user verification',
        question: 'Should we use TypeScript?',
      };
      const result = planner.validate(action, makeState());
      expect(result.valid).toBe(true);
    });

    it('missing question is rejected', () => {
      const action = {
        type: 'ask_user',
        reason: 'Need verification',
      };
      const result = planner.validate(action, makeState());
      expect(result.valid).toBe(false);
    });
  });

  describe('common validation', () => {
    it('missing type is rejected', () => {
      const result = planner.validate({ reason: 'Description' }, makeState());
      expect(result.valid).toBe(false);
    });

    it('invalid type is rejected', () => {
      const result = planner.validate(
        { type: 'unknown_action', reason: 'Description' },
        makeState(),
      );
      expect(result.valid).toBe(false);
    });

    it('missing reason is rejected', () => {
      const result = planner.validate(
        { type: 'report', summary: 'Report' },
        makeState(),
      );
      expect(result.valid).toBe(false);
    });

    it('empty reason is rejected', () => {
      const result = planner.validate(
        { type: 'report', reason: '  ', summary: 'Report' },
        makeState(),
      );
      expect(result.valid).toBe(false);
    });

    it('non-object input is rejected', () => {
      expect(planner.validate(null, makeState()).valid).toBe(false);
      expect(planner.validate('string', makeState()).valid).toBe(false);
      expect(planner.validate(42, makeState()).valid).toBe(false);
    });
  });

  describe('parseLeaderOutput', () => {
    it('direct JSON output is parsed', async () => {
      const raw = JSON.stringify({
        type: 'create_task',
        reason: 'Need to implement',
        task: {
          title: 'Implement login',
          description: 'Description',
          role: 'coder',
          dependencies: [],
        },
      });
      const result = await planner.parseLeaderOutput(raw, makeState());
      expect(result.action).not.toBeNull();
      expect(result.action!.type).toBe('create_task');
    });

    it('extracts JSON from markdown code block', async () => {
      const raw = `Here is the action:\n\`\`\`json\n${JSON.stringify({
        type: 'report',
        reason: 'Report',
        summary: 'Done',
      })}\n\`\`\`\n`;
      const result = await planner.parseLeaderOutput(raw, makeState());
      expect(result.action).not.toBeNull();
      expect(result.action!.type).toBe('report');
    });

    it('extracts JSON from free text', async () => {
      const raw = `I think we should do this:\n${JSON.stringify({
        type: 'ask_user',
        reason: 'Need verification',
        question: 'Which architecture should we use?',
      })}\nPlease advise.`;
      const result = await planner.parseLeaderOutput(raw, makeState());
      expect(result.action).not.toBeNull();
      expect(result.action!.type).toBe('ask_user');
    });

    it('invalid JSON returns null', async () => {
      const result = await planner.parseLeaderOutput('This is not JSON', makeState());
      expect(result.action).toBeNull();
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('validation failure returns null and error list', async () => {
      const raw = JSON.stringify({ type: 'create_task', reason: 'Need' });
      const result = await planner.parseLeaderOutput(raw, makeState());
      expect(result.action).toBeNull();
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('retry mechanism: first fails, second succeeds', async () => {
      let callCount = 0;
      const retryFn = async () => {
        callCount++;
        if (callCount === 1) {
          return JSON.stringify({ type: 'create_task', reason: 'Need' }); // Missing task
        }
        return JSON.stringify({
          type: 'create_task',
          reason: 'Need',
          task: {
            title: 'task',
            description: 'Description',
            role: 'coder',
            dependencies: [],
          },
        });
      };

      const raw = JSON.stringify({ type: 'create_task', reason: 'Need' });
      const result = await planner.parseLeaderOutput(raw, makeState(), retryFn);
      expect(result.action).not.toBeNull();
      expect(result.retries).toBeGreaterThan(0);
    });

    it('all retries fail returns null', async () => {
      const raw = JSON.stringify({ type: 'create_task', reason: 'Need' });
      const result = await planner.parseLeaderOutput(raw, makeState());
      expect(result.action).toBeNull();
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('non-JSON output retries then returns null', async () => {
      const result = await planner.parseLeaderOutput('not json at all', makeState());
      expect(result.action).toBeNull();
      expect(result.retries).toBeGreaterThan(0);
    });

    it('valid JSON on first try passes with no retries', async () => {
      const raw = JSON.stringify({
        type: 'report',
        reason: 'Report',
        summary: 'Done',
      });
      const result = await planner.parseLeaderOutput(raw, makeState());
      expect(result.action).not.toBeNull();
      expect(result.retries).toBe(0);
    });
  });
});
