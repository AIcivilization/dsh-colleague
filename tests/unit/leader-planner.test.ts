/**
 * LeaderPlanner unit tests
 *
 * Test coverage:
 * - - Output schema validation (create_task / unblock_task / request_* / report / ask_user)
 * - - Dependency validation (non-existent dependencies, loop dependencies)
 * - - Concurrency budget validation
 * - - JSON extraction and parsing (direct JSON, code blocks, no JSON)
 * - - Retry mechanism
 * - - reason field must be non-empty
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LeaderPlanner } from '../../core/planner/leader-planner';
import type { TeamState, Task, MemberConfig } from '../../core/runtime/types';

function makeMembers(): MemberConfig[] {
  return [
    { id: 'leader-01', name: 'Lead', role: 'leader', provider: 'dsh', slotId: 0 },
    { id: 'coder-01', name: 'Coder', role: 'coder', provider: 'dsh', slotId: 1 },
    { id: 'reviewer-01', name: 'Reviewer', role: 'reviewer', provider: 'dsh', slotId: 2 },
    { id: 'tester-01', name: 'Tester', role: 'tester', provider: 'dsh', slotId: 3 },
    { id: 'docs-01', name: 'Doc Writer', role: 'docs', provider: 'dsh', slotId: 4 },
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
    workspace: '/tmp/test',
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
    it('Legal create_task Passed', () => {
      const action = {
        type: 'create_task',
        reason: 'Need to implement login successfully',
        task: {
          title: 'implementlogin',
          description: 'Implement user login API',
          role: 'coder',
          dependencies: [],
        },
      };
      const result = planner.validate(action, makeState());
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('Missing task fieldRejected', () => {
      const action = {
        type: 'create_task',
        reason: 'Need to implement',
      };
      const result = planner.validate(action, makeState());
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('"task"'))).toBe(true);
    });

    it('Missing title Rejected', () => {
      const action = {
        type: 'create_task',
        reason: 'Need to implement',
        task: { description: 'Description', role: 'coder', dependencies: [] },
      };
      const result = planner.validate(action, makeState());
      expect(result.valid).toBe(false);
    });

    it('illegal roleRejected', () => {
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

    it('rolecorrectshouldmemberdoes not existRejected', () => {
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

    it('dependencydoes not existoftaskRejected', () => {
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

    it('dependencystoreatoftaskPassed', () => {
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

  describe('- Concurrency budget validation', () => {
    it('Has running taskwhencannot againcreatedependencynew task（not runningdependency）', () => {
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
          // dependencies are doneof task-002（not running），triggersconcurrency limit
          dependencies: ['task-002'],
        },
      };
      const result = planner.validate(action, makeState([runningTask, passedTask]));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('concurrent limit'))).toBe(true);
    });

    it('Has running taskandNew tasknodependencywhenLegal（notcheck checkconcurrency）', () => {
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
      // nodependencywhennottriggersconcurrencycheck check（whenbeforeimplementrowfor）
      const result = planner.validate(action, makeState([runningTask]));
      expect(result.valid).toBe(true);
    });

    it('Has running taskbutNew taskdependencyitthenLegal', () => {
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

    it('maxConcurrent=2 when  two count only task', () => {
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
    it('Legal unblock_task Passed', () => {
      const blockedTask = makeTask({ id: 'task-001', status: 'blocked' });
      const action = {
        type: 'unblock_task',
        reason: 'dependencies are done',
        taskId: 'task-001',
      };
      const result = planner.validate(action, makeState([blockedTask]));
      expect(result.valid).toBe(true);
    });

    it('Missing taskId Rejected', () => {
      const action = {
        type: 'unblock_task',
        reason: 'NeedUnblock',
      };
      const result = planner.validate(action, makeState());
      expect(result.valid).toBe(false);
    });

    it('taskdoes not existRejected', () => {
      const action = {
        type: 'unblock_task',
        reason: 'NeedUnblock',
        taskId: 'nonexistent',
      };
      const result = planner.validate(action, makeState());
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('not found'))).toBe(true);
    });

    it('not blocked statustaskRejected', () => {
      const runningTask = makeTask({ id: 'task-001', status: 'running' });
      const action = {
        type: 'unblock_task',
        reason: 'NeedUnblock',
        taskId: 'task-001',
      };
      const result = planner.validate(action, makeState([runningTask]));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('not blocked'))).toBe(true);
    });
  });

  describe('request_review / request_test / request_docs Validation', () => {
    it('Legal request_review Passed', () => {
      const passedTask = makeTask({ id: 'task-001', status: 'passed' });
      const action = {
        type: 'request_review',
        reason: 'NeedReview',
        taskId: 'task-001',
      };
      const result = planner.validate(action, makeState([passedTask]));
      expect(result.valid).toBe(true);
    });

    it('tasknotDonewhen request_test Rejected', () => {
      const runningTask = makeTask({ id: 'task-001', status: 'running' });
      const action = {
        type: 'request_test',
        reason: 'NeedTest',
        taskId: 'task-001',
      };
      const result = planner.validate(action, makeState([runningTask]));
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('passed or failed'))).toBe(true);
    });

    it('Missing taskId Rejected', () => {
      const action = {
        type: 'request_review',
        reason: 'NeedReview',
      };
      const result = planner.validate(action, makeState());
      expect(result.valid).toBe(false);
    });
  });

  describe('report Validation', () => {
    it('Legal report Passed', () => {
      const action = {
        type: 'report',
        reason: 'Report done',
        summary: 'All tasks are done',
      };
      const result = planner.validate(action, makeState());
      expect(result.valid).toBe(true);
    });

    it('Missing summary Rejected', () => {
      const action = {
        type: 'report',
        reason: 'Report',
      };
      const result = planner.validate(action, makeState());
      expect(result.valid).toBe(false);
    });
  });

  describe('ask_user Validation', () => {
    it('Legal ask_user Passed', () => {
      const action = {
        type: 'ask_user',
        reason: 'Needuse user correct verify',
        question: 'isotherwise use use TypeScript？',
      };
      const result = planner.validate(action, makeState());
      expect(result.valid).toBe(true);
    });

    it('Missing question Rejected', () => {
      const action = {
        type: 'ask_user',
        reason: 'Needcorrect verify',
      };
      const result = planner.validate(action, makeState());
      expect(result.valid).toBe(false);
    });
  });

  describe('common useValidation', () => {
    it('Missing type Rejected', () => {
      const result = planner.validate({ reason: 'Description' }, makeState());
      expect(result.valid).toBe(false);
    });

    it('Illegal type Rejected', () => {
      const result = planner.validate(
        { type: 'unknown_action', reason: 'Description' },
        makeState(),
      );
      expect(result.valid).toBe(false);
    });

    it('Missing reason Rejected', () => {
      const result = planner.validate(
        { type: 'report', summary: 'Report' },
        makeState(),
      );
      expect(result.valid).toBe(false);
    });

    it('empty reason Rejected', () => {
      const result = planner.validate(
        { type: 'report', reason: '  ', summary: 'Report' },
        makeState(),
      );
      expect(result.valid).toBe(false);
    });

    it('Non-objectinputRejected', () => {
      expect(planner.validate(null, makeState()).valid).toBe(false);
      expect(planner.validate('string', makeState()).valid).toBe(false);
      expect(planner.validate(42, makeState()).valid).toBe(false);
    });
  });

  describe('parseLeaderOutput', () => {
    it('Direct JSON outputis parsing', async () => {
      const raw = JSON.stringify({
        type: 'create_task',
        reason: 'Need to implement',
        task: {
          title: 'implementlogin',
          description: 'Description',
          role: 'coder',
          dependencies: [],
        },
      });
      const result = await planner.parseLeaderOutput(raw, makeState());
      expect(result.action).not.toBeNull();
      expect(result.action!.type).toBe('create_task');
    });

    it('from markdown code blockextraction JSON', async () => {
      const raw = `Here is the action:\n\`\`\`json\n${JSON.stringify({
        type: 'report',
        reason: 'Report',
        summary: 'Done',
      })}\n\`\`\`\n`;
      const result = await planner.parseLeaderOutput(raw, makeState());
      expect(result.action).not.toBeNull();
      expect(result.action!.type).toBe('report');
    });

    it('fromfree textinextraction JSON', async () => {
      const raw = `I think we should do this:\n${JSON.stringify({
        type: 'ask_user',
        reason: 'Needcorrect verify',
        question: 'use use which count  architect？',
      })}\nPlease advise.`;
      const result = await planner.parseLeaderOutput(raw, makeState());
      expect(result.action).not.toBeNull();
      expect(result.action!.type).toBe('ask_user');
    });

    it('invalid JSON return return null', async () => {
      const result = await planner.parseLeaderOutput('This is not JSON', makeState());
      expect(result.action).toBeNull();
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('Validationfailedreturn return null anderrorlist', async () => {
      const raw = JSON.stringify({ type: 'create_task', reason: 'Need' });
      const result = await planner.parseLeaderOutput(raw, makeState());
      expect(result.action).toBeNull();
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('- Retry mechanism：firstfailed，secondsuccess', async () => {
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

      // firstuseinvalidoutput
      const raw = JSON.stringify({ type: 'create_task', reason: 'Need' });
      const result = await planner.parseLeaderOutput(raw, makeState(), retryFn);
      expect(result.action).not.toBeNull();
      expect(result.retries).toBeGreaterThan(0);
    });

    it('allretryfailedafterreturn return null', async () => {
      const raw = JSON.stringify({ type: 'create_task', reason: 'Need' });
      const result = await planner.parseLeaderOutput(raw, makeState());
      expect(result.action).toBeNull();
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('not JSON outputretryafterreturn return null', async () => {
      const result = await planner.parseLeaderOutput('not json at all', makeState());
      expect(result.action).toBeNull();
      expect(result.retries).toBeGreaterThan(0);
    });

    it('valid JSON firstthenPassed', async () => {
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
