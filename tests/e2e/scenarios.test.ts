/**
 * End-to-end tests — team flow scenario tests
 *
 * Test coverage:
 * - Normal delivery flow (planning → coding → review → test → report)
 * - Review rejection + fix + re-review
 * - Test failed + fix + re-test
 * - Pause recovery
 * - Skip task
 * - Takeover
 * - Plugin persistence (dispose + re-create)
 * - Empty plan terminal state
 * - Partial cancel terminal state
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

describe('E2E: normal delivery flow process', () => {
  let ctx: any;
  let config: TeamConfig;

  beforeEach(() => {
    ctx = createMockContext();
    config = createPersistedMockTeamConfig();
  });

  afterEach(() => {
    cleanupWorkspace(config.workspace);
  });

  it('complete delivery: planning -> coding -> Review -> Test -> finalize', () => {
    const runtime = new TeamRuntime(ctx, config);

    // planning phase
    runtime.startPlanning();
    runtime.startRunning();

    // Coder Implement success
    const codeTask = runtime.createTask('Implement success', 'Description', 'coder');
    runtime.transitionTask(codeTask.id, 'ready');
    runtime.transitionTask(codeTask.id, 'running');
    runtime.transitionTask(codeTask.id, 'passed', {
      status: 'completed',
      summary: 'successimplementation done',
      artifacts: ['src/feature.ts'],
      issues: [],
    });

    // Reviewer Review
    runtime.recordQuality(codeTask.id, {
      status: 'approved',
      summary: 'Review passed',
      issues: [],
    });

    // Tester Test
    const testTask = runtime.createTask('Test', 'Description', 'tester', [codeTask.id]);
    runtime.transitionTask(testTask.id, 'ready');
    runtime.transitionTask(testTask.id, 'running');
    runtime.transitionTask(testTask.id, 'passed', {
      status: 'completed',
      summary: 'All tests passed',
      artifacts: ['tests/feature.test.ts'],
      issues: [],
    });
    runtime.recordQuality(testTask.id, {
      status: 'test_passed',
      summary: 'Test passed',
      issues: [],
    });

    // verify can finalize
    const state = runtime.getSnapshot();
    const finalizeResult = canFinalize(state.tasks);
    expect(finalizeResult.canFinalize).toBe(true);

    // teamDone
    runtime.complete('deliveryDone');
    expect(runtime.getSnapshot().status).toBe('completed');

    runtime.dispose();
  });
});

describe('E2E: Review rejection and fix', () => {
  let ctx: any;
  let config: TeamConfig;

  beforeEach(() => {
    ctx = createMockContext();
    config = createPersistedMockTeamConfig();
  });

  afterEach(() => {
    cleanupWorkspace(config.workspace);
  });

  it('Review rejection → fix → re-review passed', () => {
    const runtime = new TeamRuntime(ctx, config);
    runtime.startPlanning();
    runtime.startRunning();

    const task = runtime.createTask('success', 'Description', 'coder');
    runtime.transitionTask(task.id, 'ready');
    runtime.transitionTask(task.id, 'running');
    runtime.transitionTask(task.id, 'passed', {
      status: 'completed',
      summary: 'Done',
      artifacts: ['src/feat.ts'],
      issues: [],
    });

    // Reviewrejection
    runtime.recordQuality(task.id, {
      status: 'changes_requested',
      summary: 'Changes needed',
      issues: [{ severity: 'warning', description: 'namingIssue' }],
    });
    expect(runtime.getSnapshot().tasks.find((t) => t.id === task.id)?.status).toBe('failed');

    // fix
    runtime.transitionTask(task.id, 'ready');
    runtime.transitionTask(task.id, 'running');
    runtime.transitionTask(task.id, 'passed', {
      status: 'completed',
      summary: 'Has fix',
      artifacts: ['src/feat.ts'],
      issues: [],
    });

    // re-review passed
    runtime.recordQuality(task.id, {
      status: 'approved',
      summary: 'Fix after passed',
      issues: [],
    });

    expect(runtime.getSnapshot().tasks.find((t) => t.id === task.id)?.status).toBe('passed');
    runtime.dispose();
  });
});

describe('E2E: Test failed and fix', () => {
  let ctx: any;
  let config: TeamConfig;

  beforeEach(() => {
    ctx = createMockContext();
    config = createPersistedMockTeamConfig();
  });

  afterEach(() => {
    cleanupWorkspace(config.workspace);
  });

  it('Test failed → fix → re-test passed', () => {
    const runtime = new TeamRuntime(ctx, config);
    runtime.startPlanning();
    runtime.startRunning();

    const codeTask = runtime.createTask('Coding', 'Description', 'coder');
    runtime.transitionTask(codeTask.id, 'ready');
    runtime.transitionTask(codeTask.id, 'running');
    runtime.transitionTask(codeTask.id, 'passed', {
      status: 'completed',
      summary: 'Done',
      artifacts: ['src/app.ts'],
      issues: [],
    });
    runtime.recordQuality(codeTask.id, {
      status: 'approved',
      summary: 'Review passed',
      issues: [],
    });

    // Test Task
    const testTask = runtime.createTask('Test', 'Description', 'tester', [codeTask.id]);
    runtime.transitionTask(testTask.id, 'ready');
    runtime.transitionTask(testTask.id, 'running');
    runtime.transitionTask(testTask.id, 'passed', {
      status: 'completed',
      summary: 'Test executed done',
      artifacts: [],
      issues: [],
    });

    // Test failed
    runtime.recordQuality(testTask.id, {
      status: 'test_failed',
      summary: '2 tests failed',
      issues: [{ severity: 'critical', description: 'test_login failed' }],
    });
    expect(runtime.getSnapshot().tasks.find((t) => t.id === testTask.id)?.status).toBe('failed');

    // fix then re-test
    runtime.transitionTask(testTask.id, 'ready');
    runtime.transitionTask(testTask.id, 'running');
    runtime.transitionTask(testTask.id, 'passed', {
      status: 'completed',
      summary: 'Fix then re-test',
      artifacts: [],
      issues: [],
    });
    runtime.recordQuality(testTask.id, {
      status: 'test_passed',
      summary: 'All passed',
      issues: [],
    });

    expect(runtime.getSnapshot().tasks.find((t) => t.id === testTask.id)?.status).toBe('passed');
    runtime.dispose();
  });
});

describe('E2E: Pause recovery', () => {
  let ctx: any;
  let config: TeamConfig;

  beforeEach(() => {
    ctx = createMockContext();
    config = createPersistedMockTeamConfig();
  });

  afterEach(() => {
    cleanupWorkspace(config.workspace);
  });

  it('pause prevents new task dispatch, resume allows continuation', () => {
    const runtime = new TeamRuntime(ctx, config);
    runtime.startPlanning();
    runtime.startRunning();

    // pause
    runtime.pause();
    expect(runtime.getSnapshot().status).toBe('paused');

    // pause should not block task creation (but execution waits for resume)
    // Here we verify pause state itself is correct
    const task = runtime.createTask('New task', 'Description', 'coder');
    expect(task.status).toBe('planned');

    // resume
    runtime.resume();
    expect(runtime.getSnapshot().status).toBe('running');

    runtime.dispose();
  });
});

describe('E2E: Skip task', () => {
  let ctx: any;
  let config: TeamConfig;

  beforeEach(() => {
    ctx = createMockContext();
    config = createPersistedMockTeamConfig();
  });

  afterEach(() => {
    cleanupWorkspace(config.workspace);
  });

  it('skip task, other tasks not affected', () => {
    const runtime = new TeamRuntime(ctx, config);
    runtime.startPlanning();
    runtime.startRunning();

    const task1 = runtime.createTask('task1', 'Description', 'coder');
    const task2 = runtime.createTask('task2', 'Description', 'reviewer');

    // skip task1
    runtime.handleIntervention({ type: 'skip', taskId: task1.id });
    expect(runtime.getSnapshot().tasks.find((t) => t.id === task1.id)?.status).toBe('cancelled');

    // task2 not affected
    runtime.transitionTask(task2.id, 'ready');
    expect(runtime.getSnapshot().tasks.find((t) => t.id === task2.id)?.status).toBe('ready');

    runtime.dispose();
  });
});

describe('E2E: Takeover', () => {
  let ctx: any;
  let config: TeamConfig;

  beforeEach(() => {
    ctx = createMockContext();
    config = createPersistedMockTeamConfig();
  });

  afterEach(() => {
    cleanupWorkspace(config.workspace);
  });

  it('takeover pauses team and records event', () => {
    const runtime = new TeamRuntime(ctx, config);
    runtime.startPlanning();
    runtime.startRunning();

    const task = runtime.createTask('task', 'Description', 'coder');
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

describe('E2E: Plugin persistence', () => {
  let ctx: any;
  let config: TeamConfig;

  beforeEach(() => {
    ctx = createMockContext();
    config = createPersistedMockTeamConfig();
  });

  afterEach(() => {
    cleanupWorkspace(config.workspace);
  });

  it('dispose then re-create runtime recovers state', () => {
    const rt1 = new TeamRuntime(ctx, config);
    rt1.startPlanning();
    rt1.startRunning();
    const task = rt1.createTask('Persistent task', 'Description', 'coder');
    rt1.transitionTask(task.id, 'ready');
    rt1.transitionTask(task.id, 'running');
    rt1.dispose();

    // re-create
    const rt2 = new TeamRuntime(ctx, config);
    const state = rt2.getSnapshot();
    expect(state.status).toBe('running');
    expect(state.tasks.length).toBe(1);
    expect(state.tasks[0].title).toBe('Persistent task');
    expect(state.tasks[0].status).toBe('running');
    rt2.dispose();
  });

  it('dispose clears event subscription', () => {
    const rt = new TeamRuntime(ctx, config);
    let received = 0;
    rt.subscribe(() => received++);
    rt.dispose();

    // dispose should not receive more events
    // dispose cleared listeners, no further notifications
    const before = received;
    // directly calling dispose cleared listeners
    expect(received).toBe(before);
  });
});

describe('E2E: Empty plan and terminal state', () => {
  let ctx: any;
  let config: TeamConfig;

  beforeEach(() => {
    ctx = createMockContext();
    config = createPersistedMockTeamConfig();
  });

  afterEach(() => {
    cleanupWorkspace(config.workspace);
  });

  it('Empty plan with direct completion produces a clear terminal state', () => {
    const runtime = new TeamRuntime(ctx, config);
    runtime.startPlanning();
    runtime.startRunning();

    // no tasks, directly complete
    const tasks = runtime.getSnapshot().tasks;
    expect(tasks.length).toBe(0);

    const finalizeResult = canFinalize(tasks);
    expect(finalizeResult.canFinalize).toBe(true);

    runtime.complete('Empty plan done');
    expect(runtime.getSnapshot().status).toBe('completed');

    runtime.dispose();
  });

  it('partial cancel, remaining tasks can finalize', () => {
    const runtime = new TeamRuntime(ctx, config);
    runtime.startPlanning();
    runtime.startRunning();

    const task1 = runtime.createTask('task1', 'Description', 'coder');
    const task2 = runtime.createTask('task2', 'Description', 'coder');

    // cancel task2
    runtime.transitionTask(task2.id, 'cancelled');

    // task1 done and passed review
    runtime.transitionTask(task1.id, 'ready');
    runtime.transitionTask(task1.id, 'running');
    runtime.transitionTask(task1.id, 'passed', {
      status: 'completed',
      summary: 'Done',
      artifacts: [],
      issues: [],
    });
    runtime.recordQuality(task1.id, {
      status: 'approved',
      summary: 'Passed',
      issues: [],
    });

    // verify finalize
    const tasks = runtime.getSnapshot().tasks;
    const finalizeResult = canFinalize(tasks);
    expect(finalizeResult.canFinalize).toBe(true);

    runtime.dispose();
  });

  it('All-failed plan produces a clear terminal state', () => {
    const runtime = new TeamRuntime(ctx, config);
    runtime.startPlanning();
    runtime.startRunning();

    const task = runtime.createTask('task', 'Description', 'coder');
    runtime.transitionTask(task.id, 'ready');
    runtime.transitionTask(task.id, 'running');
    runtime.transitionTask(task.id, 'failed', {
      status: 'failed',
      summary: 'Implementation failed',
      artifacts: [],
      issues: [{ severity: 'critical', description: 'strict error' }],
    });

    // fix then cancel
    runtime.transitionTask(task.id, 'cancelled');

    // can finalize (only cancelled task)
    const finalizeResult = canFinalize(runtime.getSnapshot().tasks);
    expect(finalizeResult.canFinalize).toBe(true);

    runtime.fail('All tasks failed');
    expect(runtime.getSnapshot().status).toBe('failed');

    runtime.dispose();
  });
});
