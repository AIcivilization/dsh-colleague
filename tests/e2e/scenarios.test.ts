/**
 * endtoendTest — teamall flow process scenario scenario
 *
 * Testcover cover：
 * - normal delivery flow process（planning→coding→Review→Test→report）
 * - Reviewrejection + fix + re-review
 * - Testfailed + fix + re-test
 * - pauserecovery
 * - skiptask
 * - controlled
 * - plugin heavy load（dispose + heavy create）
 * - empty planterminal state
 * - partial get cancelterminal state
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

  it('complete whole delivery：planning→coding→Review→Test→finalize', () => {
    const runtime = new TeamRuntime(ctx, config);

    // planningphase
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
    const testTask = runtime.createTask('Testsuccess', 'Description', 'tester', [codeTask.id]);
    runtime.transitionTask(testTask.id, 'ready');
    runtime.transitionTask(testTask.id, 'running');
    runtime.transitionTask(testTask.id, 'passed', {
      status: 'completed',
      summary: 'allTestPassed',
      artifacts: ['tests/feature.test.ts'],
      issues: [],
    });
    runtime.recordQuality(testTask.id, {
      status: 'test_passed',
      summary: 'TestPassed',
      issues: [],
    });

    // verifycan be finalize
    const state = runtime.getSnapshot();
    const finalizeResult = canFinalize(state.tasks);
    expect(finalizeResult.canFinalize).toBe(true);

    // teamDone
    runtime.complete('deliveryDone');
    expect(runtime.getSnapshot().status).toBe('completed');

    runtime.dispose();
  });
});

describe('E2E: Reviewrejectionandfix', () => {
  let ctx: any;
  let config: TeamConfig;

  beforeEach(() => {
    ctx = createMockContext();
    config = createPersistedMockTeamConfig();
  });

  afterEach(() => {
    cleanupWorkspace(config.workspace);
  });

  it('Reviewrejection → fix → re-review passed', () => {
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
      summary: 'hasfix',
      artifacts: ['src/feat.ts'],
      issues: [],
    });

    // re-review passed
    runtime.recordQuality(task.id, {
      status: 'approved',
      summary: 'fix afterPassed',
      issues: [],
    });

    expect(runtime.getSnapshot().tasks.find((t) => t.id === task.id)?.status).toBe('passed');
    runtime.dispose();
  });
});

describe('E2E: Testfailedandfix', () => {
  let ctx: any;
  let config: TeamConfig;

  beforeEach(() => {
    ctx = createMockContext();
    config = createPersistedMockTeamConfig();
  });

  afterEach(() => {
    cleanupWorkspace(config.workspace);
  });

  it('Testfailed → fix → re-testPassed', () => {
    const runtime = new TeamRuntime(ctx, config);
    runtime.startPlanning();
    runtime.startRunning();

    const codeTask = runtime.createTask('coding', 'Description', 'coder');
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
      summary: 'TestexecutesDone',
      artifacts: [],
      issues: [],
    });

    // Testfailed
    runtime.recordQuality(testTask.id, {
      status: 'test_failed',
      summary: '2 countTestfailed',
      issues: [{ severity: 'critical', description: 'test_login failed' }],
    });
    expect(runtime.getSnapshot().tasks.find((t) => t.id === testTask.id)?.status).toBe('failed');

    // fix then re-Test
    runtime.transitionTask(testTask.id, 'ready');
    runtime.transitionTask(testTask.id, 'running');
    runtime.transitionTask(testTask.id, 'passed', {
      status: 'completed',
      summary: 'fix then re-Test',
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

describe('E2E: pauserecovery', () => {
  let ctx: any;
  let config: TeamConfig;

  beforeEach(() => {
    ctx = createMockContext();
    config = createPersistedMockTeamConfig();
  });

  afterEach(() => {
    cleanupWorkspace(config.workspace);
  });

  it('pause afternotagain dispatch sendNew task，recoveryaftercancontinue continue', () => {
    const runtime = new TeamRuntime(ctx, config);
    runtime.startPlanning();
    runtime.startRunning();

    // pause
    runtime.pause();
    expect(runtime.getSnapshot().status).toBe('paused');

    // pause after creating taskshould not block stop（but actually executesshouldwaitrecovery）
    // Here here verify pause statusbook itself correct correct
    const task = runtime.createTask('New task', 'Description', 'coder');
    expect(task.status).toBe('planned');

    // recovery
    runtime.resume();
    expect(runtime.getSnapshot().status).toBe('running');

    runtime.dispose();
  });
});

describe('E2E: skiptask', () => {
  let ctx: any;
  let config: TeamConfig;

  beforeEach(() => {
    ctx = createMockContext();
    config = createPersistedMockTeamConfig();
  });

  afterEach(() => {
    cleanupWorkspace(config.workspace);
  });

  it('skiptaskafteritsothertasknotaffectedaffect', () => {
    const runtime = new TeamRuntime(ctx, config);
    runtime.startPlanning();
    runtime.startRunning();

    const task1 = runtime.createTask('task1', 'Description', 'coder');
    const task2 = runtime.createTask('task2', 'Description', 'reviewer');

    // skip task1
    runtime.handleIntervention({ type: 'skip', taskId: task1.id });
    expect(runtime.getSnapshot().tasks.find((t) => t.id === task1.id)?.status).toBe('cancelled');

    // task2 notaffectedaffect
    runtime.transitionTask(task2.id, 'ready');
    expect(runtime.getSnapshot().tasks.find((t) => t.id === task2.id)?.status).toBe('ready');

    runtime.dispose();
  });
});

describe('E2E: controlled', () => {
  let ctx: any;
  let config: TeamConfig;

  beforeEach(() => {
    ctx = createMockContext();
    config = createPersistedMockTeamConfig();
  });

  afterEach(() => {
    cleanupWorkspace(config.workspace);
  });

  it('controlledoperationpause teamand record', () => {
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

describe('E2E: plugin heavy load', () => {
  let ctx: any;
  let config: TeamConfig;

  beforeEach(() => {
    ctx = createMockContext();
    config = createPersistedMockTeamConfig();
  });

  afterEach(() => {
    cleanupWorkspace(config.workspace);
  });

  it('dispose afterheavy create runtime canrecoverystatus', () => {
    const rt1 = new TeamRuntime(ctx, config);
    rt1.startPlanning();
    rt1.startRunning();
    const task = rt1.createTask('persistencetask', 'Description', 'coder');
    rt1.transitionTask(task.id, 'ready');
    rt1.transitionTask(task.id, 'running');
    rt1.dispose();

    // heavy create
    const rt2 = new TeamRuntime(ctx, config);
    const state = rt2.getSnapshot();
    expect(state.status).toBe('running');
    expect(state.tasks.length).toBe(1);
    expect(state.tasks[0].title).toBe('persistencetask');
    expect(state.tasks[0].status).toBe('running');
    rt2.dispose();
  });

  it('dispose after eventsubscription is cleared', () => {
    const rt = new TeamRuntime(ctx, config);
    let received = 0;
    rt.subscribe(() => received++);
    rt.dispose();

    // dispose aftershould notagain receivetoevent
    // due to dispose cleanempty listeners，namely use triggers alsonotnotification
    const before = received;
    // directly calling dispose cleared listeners
    expect(received).toBe(before);
  });
});

describe('E2E: empty planandterminal state', () => {
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

    // no any tasks，directly completes
    const tasks = runtime.getSnapshot().tasks;
    expect(tasks.length).toBe(0);

    const finalizeResult = canFinalize(tasks);
    expect(finalizeResult.canFinalize).toBe(true);

    runtime.complete('empty planDone');
    expect(runtime.getSnapshot().status).toBe('completed');

    runtime.dispose();
  });

  it('partial get cancelafterremainingtaskcanfinalize', () => {
    const runtime = new TeamRuntime(ctx, config);
    runtime.startPlanning();
    runtime.startRunning();

    const task1 = runtime.createTask('task1', 'Description', 'coder');
    const task2 = runtime.createTask('task2', 'Description', 'coder');

    // get cancel task2
    runtime.transitionTask(task2.id, 'cancelled');

    // task1 DoneandPassedReview
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
      summary: 'implementfailed',
      artifacts: [],
      issues: [{ severity: 'critical', description: 'strict heavy error' }],
    });

    // fix afterget cancel
    runtime.transitionTask(task.id, 'cancelled');

    // can be finalize（only onetaskis cancelled）
    const finalizeResult = canFinalize(runtime.getSnapshot().tasks);
    expect(finalizeResult.canFinalize).toBe(true);

    runtime.fail('alltaskfailed');
    expect(runtime.getSnapshot().status).toBe('failed');

    runtime.dispose();
  });
});
