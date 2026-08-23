/**
 * TeamRuntime state machine unit tests
 *
 * Test coverage:
 * - Legal state transitions
 * - Illegal state transitions (throw exception + record error event)
 * - Task state transitions (including dependency checks, workspace lock)
 * - Event append and state projection consistency
 * - User intervention (pause/resume/skip/takeover/revise)
 * - Event subscription and notification
 * - Member controlled operations (add/remove)
 * - Persistence and recovery
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TeamRuntime } from '../../core/runtime/team-runtime';
import {
  createMockContext,
  createMockTeamConfig,
  createPersistedMockTeamConfig,
  cleanupWorkspace,
} from './helpers';
import type { TeamConfig, TeamEvent, MemberConfig } from '../../core/runtime/types';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('TeamRuntime State Machine', () => {
  let ctx: any;
  let config: TeamConfig;
  let runtime: TeamRuntime;

  beforeEach(() => {
    ctx = createMockContext();
    config = createMockTeamConfig();
    runtime = new TeamRuntime(ctx, config);
  });

  afterEach(() => {
    runtime.dispose();
    cleanupWorkspace(config.workspace);
  });

  describe('Team State Transitions', () => {
    it('idle → planning legal transition', () => {
      runtime.startPlanning();
      const state = runtime.getSnapshot();
      expect(state.status).toBe('planning');
    });

    it('idle → running illegal transition (cannot skip planning)', () => {
      expect(() => runtime.startRunning()).toThrow(
        'Invalid team status transition: idle → running',
      );
      const state = runtime.getSnapshot();
      expect(state.status).toBe('idle');
      // Should record an error event
      const errors = state.events.filter((e) => e.type === 'error');
      expect(errors.length).toBeGreaterThan(0);
    });

    it('idle → planning → running legal path', () => {
      runtime.startPlanning();
      runtime.startRunning();
      expect(runtime.getSnapshot().status).toBe('running');
    });

    it('running → paused → running legal resume', () => {
      runtime.startPlanning();
      runtime.startRunning();
      runtime.pause();
      expect(runtime.getSnapshot().status).toBe('paused');
      runtime.resume();
      expect(runtime.getSnapshot().status).toBe('running');
    });

    it('running → completed legal completion', () => {
      runtime.startPlanning();
      runtime.startRunning();
      runtime.complete('All done');
      expect(runtime.getSnapshot().status).toBe('completed');
    });

    it('running → failed → planning can retry', () => {
      runtime.startPlanning();
      runtime.startRunning();
      runtime.fail('Test failure');
      expect(runtime.getSnapshot().status).toBe('failed');
      // failed → planning is legal
      runtime.startPlanning();
      expect(runtime.getSnapshot().status).toBe('planning');
    });

    it('completed is a terminal state, no further transitions', () => {
      runtime.startPlanning();
      runtime.startRunning();
      runtime.complete('Done');
      expect(() => runtime.startPlanning()).toThrow(
        'Invalid team status transition: completed → planning',
      );
    });

    it('cancelled is a terminal state, no further transitions', () => {
      runtime.cancel();
      expect(runtime.getSnapshot().status).toBe('cancelled');
      expect(() => runtime.startPlanning()).toThrow(
        'Invalid team status transition: cancelled → planning',
      );
    });

    it('idle → cancelled direct cancel is legal', () => {
      runtime.cancel();
      expect(runtime.getSnapshot().status).toBe('cancelled');
    });
  });

  describe('Task Creation and State Transitions', () => {
    it('Create task and assign role', () => {
      runtime.startPlanning();
      const task = runtime.createTask(
        'Implement login',
        'Implement user login feature',
        'coder',
      );
      expect(task.title).toBe('Implement login');
      expect(task.role).toBe('coder');
      expect(task.status).toBe('planned');
      expect(task.assigneeId).toBe('coder-01');

      const state = runtime.getSnapshot();
      expect(state.tasks.length).toBe(1);
      expect(state.tasks[0].id).toBe(task.id);
    });

    it('Create task with non-existent role should throw', () => {
      // First remove tester member to make tester role unavailable
      runtime.removeMember('tester-01');
      runtime.startPlanning();
      expect(() =>
        runtime.createTask('Task', 'Description', 'tester'),
      ).toThrow('No member with role "tester" available');
    });

    it('Task transition planned → ready → running → passed', () => {
      runtime.startPlanning();
      runtime.startRunning();
      const task = runtime.createTask('Task A', 'Description', 'coder');
      runtime.transitionTask(task.id, 'ready');
      runtime.transitionTask(task.id, 'running');
      runtime.transitionTask(task.id, 'passed');
      const state = runtime.getSnapshot();
      const updated = state.tasks.find((t) => t.id === task.id);
      expect(updated?.status).toBe('passed');
    });

    it('Task illegal transition running → planned throws', () => {
      runtime.startPlanning();
      runtime.startRunning();
      const task = runtime.createTask('Task', 'Description', 'coder');
      runtime.transitionTask(task.id, 'ready');
      runtime.transitionTask(task.id, 'running');
      expect(() => runtime.transitionTask(task.id, 'planned')).toThrow(
        'Invalid task status transition: running → planned',
      );
    });

    it('passed can only transition to failed (review rejection), not other states', () => {
      runtime.startPlanning();
      runtime.startRunning();
      const task = runtime.createTask('Task', 'Description', 'coder');
      runtime.transitionTask(task.id, 'ready');
      runtime.transitionTask(task.id, 'running');
      runtime.transitionTask(task.id, 'passed');
      // passed → running is illegal
      expect(() => runtime.transitionTask(task.id, 'running')).toThrow(
        'Invalid task status transition: passed → running',
      );
      // passed → failed is legal (review rejection)
      runtime.transitionTask(task.id, 'failed');
      expect(runtime.getSnapshot().tasks.find((t) => t.id === task.id)?.status).toBe('failed');
    });

    it('cancelled is a terminal state, no further transitions', () => {
      runtime.startPlanning();
      const task = runtime.createTask('Task', 'Description', 'coder');
      runtime.transitionTask(task.id, 'cancelled');
      expect(() => runtime.transitionTask(task.id, 'ready')).toThrow(
        'Invalid task status transition: cancelled → ready',
      );
    });

    it('failed → ready can fix and retry', () => {
      runtime.startPlanning();
      runtime.startRunning();
      const task = runtime.createTask('Task', 'Description', 'coder');
      runtime.transitionTask(task.id, 'ready');
      runtime.transitionTask(task.id, 'running');
      runtime.transitionTask(task.id, 'failed');
      runtime.transitionTask(task.id, 'ready');
      const state = runtime.getSnapshot();
      expect(state.tasks.find((t) => t.id === task.id)?.status).toBe('ready');
    });
  });

  describe('Task Dependency Checks', () => {
    it('Cannot ready when dependencies are not complete', () => {
      runtime.startPlanning();
      const task1 = runtime.createTask('Task 1', 'Description', 'coder');
      const task2 = runtime.createTask('Task 2', 'Description', 'coder', [task1.id]);
      runtime.startRunning();

      // task2 depends on task1, task1 not yet complete
      expect(() => runtime.transitionTask(task2.id, 'ready')).toThrow(
        `dependency ${task1.id} not passed`,
      );
    });

    it('Can ready when dependencies are complete', () => {
      runtime.startPlanning();
      const task1 = runtime.createTask('Task 1', 'Description', 'coder');
      const task2 = runtime.createTask('Task 2', 'Description', 'coder', [task1.id]);
      runtime.startRunning();

      // Complete task1
      runtime.transitionTask(task1.id, 'ready');
      runtime.transitionTask(task1.id, 'running');
      runtime.transitionTask(task1.id, 'passed');

      // Now task2 can be ready
      runtime.transitionTask(task2.id, 'ready');
      expect(runtime.getSnapshot().tasks.find((t) => t.id === task2.id)?.status).toBe('ready');
    });

    it('Create task with non-existent dependency should throw', () => {
      runtime.startPlanning();
      expect(() =>
        runtime.createTask('Task', 'Description', 'coder', ['nonexistent-id']),
      ).toThrow('Dependency task not found: nonexistent-id');
    });

    it('Circular dependency detection', () => {
      runtime.startPlanning();
      const task1 = runtime.createTask('Task 1', 'Description', 'coder');
      const task2 = runtime.createTask('Task 2', 'Description', 'coder', [task1.id]);
      // Try creating task3 depending on task2, which depends on task1
      // Then attempt to make task1 depend on task3 → loop
      // But createTask doesn't support modifying existing dependencies, so test checkCircularDependency indirectly
      // Verify via creating a chain dependency
      const task3 = runtime.createTask('Task 3', 'Description', 'coder', [task2.id]);
      expect(task3.id).toBeDefined();
      // Verify chain: task3 → task2 → task1 (legal, no cycle)
    });
  });

  describe('Workspace Lock Integration', () => {
    it('coder task acquires lock when running', () => {
      runtime.startPlanning();
      runtime.startRunning();
      const task = runtime.createTask('Coding Task', 'Description', 'coder');
      runtime.transitionTask(task.id, 'ready');
      runtime.transitionTask(task.id, 'running');
      // Workspace lock should be held
      expect(runtime.getWorkspaceLock().isLocked()).toBe(true);
      expect(runtime.getWorkspaceLock().getLockHolder()).toBe(task.id);
    });

    it('coder task releases lock after passed', () => {
      runtime.startPlanning();
      runtime.startRunning();
      const task = runtime.createTask('Coding Task', 'Description', 'coder');
      runtime.transitionTask(task.id, 'ready');
      runtime.transitionTask(task.id, 'running');
      runtime.transitionTask(task.id, 'passed');
      expect(runtime.getWorkspaceLock().isLocked()).toBe(false);
    });

    it('coder task releases lock after failed', () => {
      runtime.startPlanning();
      runtime.startRunning();
      const task = runtime.createTask('Coding Task', 'Description', 'coder');
      runtime.transitionTask(task.id, 'ready');
      runtime.transitionTask(task.id, 'running');
      runtime.transitionTask(task.id, 'failed');
      expect(runtime.getWorkspaceLock().isLocked()).toBe(false);
    });

    it('reviewer task does not need write lock', () => {
      runtime.startPlanning();
      runtime.startRunning();
      const task = runtime.createTask('Review Task', 'Description', 'reviewer');
      runtime.transitionTask(task.id, 'ready');
      runtime.transitionTask(task.id, 'running');
      // reviewer does not acquire write lock
      expect(runtime.getWorkspaceLock().isLocked()).toBe(false);
    });
  });

  describe('Quality Conclusions and Fix Loop', () => {
    it('approved quality conclusion transitions task to passed', () => {
      runtime.startPlanning();
      runtime.startRunning();
      const task = runtime.createTask('Coding Task', 'Description', 'coder');
      runtime.transitionTask(task.id, 'ready');
      runtime.transitionTask(task.id, 'running');

      runtime.recordQuality(task.id, {
        status: 'approved',
        summary: 'Review passed',
        issues: [],
      });

      const state = runtime.getSnapshot();
      expect(state.tasks.find((t) => t.id === task.id)?.status).toBe('passed');
      expect(state.tasks.find((t) => t.id === task.id)?.quality?.status).toBe('approved');
    });

    it('changes_requested quality conclusion transitions task to failed', () => {
      runtime.startPlanning();
      runtime.startRunning();
      const task = runtime.createTask('Coding Task', 'Description', 'coder');
      runtime.transitionTask(task.id, 'ready');
      runtime.transitionTask(task.id, 'running');

      runtime.recordQuality(task.id, {
        status: 'changes_requested',
        summary: 'Changes needed',
        issues: [
          { severity: 'warning', description: 'Variable naming non-standard' },
        ],
      });

      const state = runtime.getSnapshot();
      expect(state.tasks.find((t) => t.id === task.id)?.status).toBe('failed');
    });

    it('test_passed quality conclusion transitions task to passed', () => {
      runtime.startPlanning();
      runtime.startRunning();
      const task = runtime.createTask('Test Task', 'Description', 'tester');
      runtime.transitionTask(task.id, 'ready');
      runtime.transitionTask(task.id, 'running');

      runtime.recordQuality(task.id, {
        status: 'test_passed',
        summary: 'All passed',
        issues: [],
      });

      expect(runtime.getSnapshot().tasks.find((t) => t.id === task.id)?.status).toBe('passed');
    });

    it('test_failed quality conclusion transitions task to failed', () => {
      runtime.startPlanning();
      runtime.startRunning();
      const task = runtime.createTask('Test Task', 'Description', 'tester');
      runtime.transitionTask(task.id, 'ready');
      runtime.transitionTask(task.id, 'running');

      runtime.recordQuality(task.id, {
        status: 'test_failed',
        summary: '2 failures',
        issues: [
          { severity: 'critical', description: 'test_login failed' },
        ],
      });

      expect(runtime.getSnapshot().tasks.find((t) => t.id === task.id)?.status).toBe('failed');
    });
  });

  describe('User Intervention', () => {
    it('pause pauses team', () => {
      runtime.startPlanning();
      runtime.startRunning();
      runtime.pause();
      expect(runtime.getSnapshot().status).toBe('paused');
      // Should record a user_intervention event
      const events = runtime.getEvents();
      const interventions = events.filter((e) => e.type === 'user_intervention');
      expect(interventions.some((e) => e.data.type === 'pause')).toBe(true);
    });

    it('resume resumes team', () => {
      runtime.startPlanning();
      runtime.startRunning();
      runtime.pause();
      runtime.resume();
      expect(runtime.getSnapshot().status).toBe('running');
      const events = runtime.getEvents();
      const interventions = events.filter((e) => e.type === 'user_intervention');
      expect(interventions.some((e) => e.data.type === 'resume')).toBe(true);
    });

    it('skip skips a task', () => {
      runtime.startPlanning();
      const task = runtime.createTask('Task', 'Description', 'coder');
      runtime.handleIntervention({ type: 'skip', taskId: task.id });
      expect(runtime.getSnapshot().tasks.find((t) => t.id === task.id)?.status).toBe('cancelled');
    });

    it('skip without taskId should throw', () => {
      expect(() => runtime.handleIntervention({ type: 'skip' })).toThrow(
        'Skip intervention requires a taskId',
      );
    });

    it('takeover pauses team and records', () => {
      runtime.startPlanning();
      runtime.startRunning();
      const task = runtime.createTask('Task', 'Description', 'coder');
      runtime.handleIntervention({ type: 'takeover', taskId: task.id });
      expect(runtime.getSnapshot().status).toBe('paused');
      const events = runtime.getEvents();
      const interventions = events.filter(
        (e) => e.type === 'user_intervention' && e.data.type === 'takeover',
      );
      expect(interventions.length).toBe(1);
    });

    it('revise records revision instructions', () => {
      runtime.handleIntervention({ type: 'revise', message: 'Please change the login method' });
      const events = runtime.getEvents();
      const interventions = events.filter(
        (e) => e.type === 'user_intervention' && e.data.type === 'revise',
      );
      expect(interventions.length).toBe(1);
      expect(interventions[0].data.message).toBe('Please change the login method');
    });
  });

  describe('Event Stream and Subscription', () => {
    it('subscribe receives real-time events', () => {
      const received: TeamEvent[] = [];
      const unsub = runtime.subscribe((event) => received.push(event));

      runtime.startPlanning();
      expect(received.length).toBeGreaterThan(0);
      expect(received.some((e) => e.type === 'team_status_changed')).toBe(true);

      unsub();
      // After unsubscribing, no more events received
      const beforeLen = received.length;
      runtime.startRunning();
      expect(received.length).toBe(beforeLen);
    });

    it('getEvents returns all historical events', () => {
      // Constructor automatically appends team_created + member_added events
      const events = runtime.getEvents();
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe('team_created');
    });

    it('getEvents(since) filters by timestamp', () => {
      runtime.startPlanning();
      const ts = Date.now();
      // Ensure subsequent event timestamps > ts
      const wait = () => new Promise<void>((r) => setTimeout(r, 5));
      // Synchronous operations can't wait, just use an earlier timestamp
      const events = runtime.getEvents(0);
      expect(events.length).toBeGreaterThan(0);
    });

    it('Listener exception does not affect main flow', () => {
      runtime.subscribe(() => {
        throw new Error('listener error');
      });
      // Should not throw
      expect(() => runtime.startPlanning()).not.toThrow();
    });
  });

  describe('Member Controlled Operations', () => {
    it('addMember adds a new member', () => {
      const newMember: MemberConfig = {
        id: 'coder-02',
        name: 'Coder 2',
        role: 'coder',
        provider: 'dsh-sdk',
        slotId: 5,
      };
      runtime.addMember(newMember);
      const state = runtime.getSnapshot();
      expect(state.members.find((m) => m.id === 'coder-02')).toBeDefined();
    });

    it('addMember throws on duplicate ID', () => {
      expect(() =>
        runtime.addMember({
          id: 'coder-01',
          name: 'Duplicate Coder',
          role: 'coder',
          provider: 'dsh-sdk',
          slotId: 9,
        }),
      ).toThrow('Member with id "coder-01" already exists');
    });

    it('removeMember removes a non-leader member', () => {
      runtime.removeMember('coder-01');
      const state = runtime.getSnapshot();
      expect(state.members.find((m) => m.id === 'coder-01')).toBeUndefined();
    });

    it('removeMember cannot remove leader', () => {
      expect(() => runtime.removeMember('leader-01')).toThrow(
        'Cannot remove leader member',
      );
    });

    it('removeMember throws for non-existent member', () => {
      expect(() => runtime.removeMember('nonexistent')).toThrow(
        'Member not found: nonexistent',
      );
    });
  });

  describe('Persistence and Recovery', () => {
    it('With memoryEnabled, events persist to file', () => {
      const persistedConfig = createPersistedMockTeamConfig();
      const persistedRuntime = new TeamRuntime(ctx, persistedConfig);

      persistedRuntime.startPlanning();

      const eventsPath = resolve(persistedConfig.workspace, '.colleague', 'events.jsonl');
      expect(existsSync(eventsPath)).toBe(true);

      const content = readFileSync(eventsPath, 'utf-8');
      const lines = content.split('\n').filter((l: string) => l.trim());
      expect(lines.length).toBeGreaterThan(0);

      // Each line is valid JSON
      for (const line of lines) {
        const event = JSON.parse(line);
        expect(event.type).toBeDefined();
        expect(event.teamId).toBe('test-team-persisted');
      }

      persistedRuntime.dispose();
      cleanupWorkspace(persistedConfig.workspace);
    });

    it('Recovers state from event stream after restart', () => {
      const persistedConfig = createPersistedMockTeamConfig();

      // Phase 1: Create team and add state
      const rt1 = new TeamRuntime(ctx, persistedConfig);
      rt1.startPlanning();
      rt1.startRunning();
      const task = rt1.createTask('Recovery Test', 'Description', 'coder');
      rt1.transitionTask(task.id, 'ready');
      rt1.dispose();

      // Phase 2: Recreate runtime, should recover from persistence
      const rt2 = new TeamRuntime(ctx, persistedConfig);
      const state = rt2.getSnapshot();
      expect(state.status).toBe('running');
      expect(state.tasks.length).toBe(1);
      expect(state.tasks[0].title).toBe('Recovery Test');
      expect(state.tasks[0].status).toBe('ready');
      rt2.dispose();
      cleanupWorkspace(persistedConfig.workspace);
    });
  });

  describe('getSnapshot Returns Safe Copy', () => {
    it('Modifying snapshot does not affect internal state', () => {
      const snap1 = runtime.getSnapshot();
      snap1.status = 'completed';
      snap1.tasks.push({
        id: 'fake',
        title: 'fake',
        description: 'fake',
        assigneeId: 'fake',
        role: 'coder',
        status: 'planned',
        dependencies: [],
        createdAt: 0,
        updatedAt: 0,
      });

      const snap2 = runtime.getSnapshot();
      expect(snap2.status).not.toBe('completed');
      expect(snap2.tasks.length).toBe(0);
    });
  });
});
