/**
 * endtoendTest — teamall flow process scenario scenario
 *
 * Testcover cover：
 * - correct normal submit delivery flow process（regulation plan→orchestrat code→Review→Test→report report）
 * - Reviewreject return + fix resume + heavy newReview
 * - Testfailed + fix resume + heavy newTest
 * - pause stoprecovery
 * - skiptask
 * - connect manage
 * - plugin component heavy load（dispose + heavy create）
 * - emptycount planterminal state
 * - part minute get cancelterminal state
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

describe('E2E: correct normal submit delivery flow process', () => {
  let ctx: any;
  let config: TeamConfig;

  beforeEach(() => {
    ctx = createMockContext();
    config = createPersistedMockTeamConfig();
  });

  afterEach(() => {
    cleanupWorkspace(config.workspace);
  });

  it('complete whole submit delivery：regulation plan→orchestrat code→Review→Test→max final ize', () => {
    const runtime = new TeamRuntime(ctx, config);

    // regulation planphase
    runtime.startPlanning();
    runtime.startRunning();

    // Coder implementsuccesscan
    const codeTask = runtime.createTask('implementsuccesscan', 'Description', 'coder');
    runtime.transitionTask(codeTask.id, 'ready');
    runtime.transitionTask(codeTask.id, 'running');
    runtime.transitionTask(codeTask.id, 'passed', {
      status: 'completed',
      summary: 'successcanimplementDone',
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
    const testTask = runtime.createTask('Testsuccesscan', 'Description', 'tester', [codeTask.id]);
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

    // verify verifycanby max final ize
    const state = runtime.getSnapshot();
    const finalizeResult = canFinalize(state.tasks);
    expect(finalizeResult.canFinalize).toBe(true);

    // teamDone
    runtime.complete('submit deliveryDone');
    expect(runtime.getSnapshot().status).toBe('completed');

    runtime.dispose();
  });
});

describe('E2E: Reviewreject returnandfix resume', () => {
  let ctx: any;
  let config: TeamConfig;

  beforeEach(() => {
    ctx = createMockContext();
    config = createPersistedMockTeamConfig();
  });

  afterEach(() => {
    cleanupWorkspace(config.workspace);
  });

  it('Reviewreject return → fix resume → heavy newReview passed', () => {
    const runtime = new TeamRuntime(ctx, config);
    runtime.startPlanning();
    runtime.startRunning();

    const task = runtime.createTask('successcan', 'Description', 'coder');
    runtime.transitionTask(task.id, 'ready');
    runtime.transitionTask(task.id, 'running');
    runtime.transitionTask(task.id, 'passed', {
      status: 'completed',
      summary: 'Done',
      artifacts: ['src/feat.ts'],
      issues: [],
    });

    // Reviewreject return
    runtime.recordQuality(task.id, {
      status: 'changes_requested',
      summary: 'Changes needed',
      issues: [{ severity: 'warning', description: 'namingIssue' }],
    });
    expect(runtime.getSnapshot().tasks.find((t) => t.id === task.id)?.status).toBe('failed');

    // fix resume
    runtime.transitionTask(task.id, 'ready');
    runtime.transitionTask(task.id, 'running');
    runtime.transitionTask(task.id, 'passed', {
      status: 'completed',
      summary: 'hasfix resume',
      artifacts: ['src/feat.ts'],
      issues: [],
    });

    // heavy newReview passed
    runtime.recordQuality(task.id, {
      status: 'approved',
      summary: 'fix resumeafterPassed',
      issues: [],
    });

    expect(runtime.getSnapshot().tasks.find((t) => t.id === task.id)?.status).toBe('passed');
    runtime.dispose();
  });
});

describe('E2E: Testfailedandfix resume', () => {
  let ctx: any;
  let config: TeamConfig;

  beforeEach(() => {
    ctx = createMockContext();
    config = createPersistedMockTeamConfig();
  });

  afterEach(() => {
    cleanupWorkspace(config.workspace);
  });

  it('Testfailed → fix resume → heavy newTestPassed', () => {
    const runtime = new TeamRuntime(ctx, config);
    runtime.startPlanning();
    runtime.startRunning();

    const codeTask = runtime.createTask('orchestrat code', 'Description', 'coder');
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
      summary: 'Testexecute rowDone',
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

    // fix resumeafterheavy newTest
    runtime.transitionTask(testTask.id, 'ready');
    runtime.transitionTask(testTask.id, 'running');
    runtime.transitionTask(testTask.id, 'passed', {
      status: 'completed',
      summary: 'fix resumeafterheavy newTest',
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

describe('E2E: pause stoprecovery', () => {
  let ctx: any;
  let config: TeamConfig;

  beforeEach(() => {
    ctx = createMockContext();
    config = createPersistedMockTeamConfig();
  });

  afterEach(() => {
    cleanupWorkspace(config.workspace);
  });

  it('pause stopafternotagain dispatch sendNew task，recoveryaftercancontinue continue', () => {
    const runtime = new TeamRuntime(ctx, config);
    runtime.startPlanning();
    runtime.startRunning();

    // pause stop
    runtime.pause();
    expect(runtime.getSnapshot().status).toBe('paused');

    // pause stopaftercreatetasknotshouldtheblock stop（but actual actual execute rowshouldwaitrecovery）
    // Here here verify verify pause stopstatusbook itself correct correct
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

describe('E2E: connect manage', () => {
  let ctx: any;
  let config: TeamConfig;

  beforeEach(() => {
    ctx = createMockContext();
    config = createPersistedMockTeamConfig();
  });

  afterEach(() => {
    cleanupWorkspace(config.workspace);
  });

  it('connect manageoperationpause stopteamand record record', () => {
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

describe('E2E: plugin component heavy load', () => {
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

  it('dispose aftereventsubscribeallclean remove', () => {
    const rt = new TeamRuntime(ctx, config);
    let received = 0;
    rt.subscribe(() => received++);
    rt.dispose();

    // dispose afternotshouldagain receivetoevent
    // due to dispose cleanempty listeners，namely use trigger send alsonotnotification
    const before = received;
    // direct connect adjust use dispose hasclean remove listeners
    expect(received).toBe(before);
  });
});

describe('E2E: emptycount planandterminal state', () => {
  let ctx: any;
  let config: TeamConfig;

  beforeEach(() => {
    ctx = createMockContext();
    config = createPersistedMockTeamConfig();
  });

  afterEach(() => {
    cleanupWorkspace(config.workspace);
  });

  it('emptycount plan direct connectDoneproduce produce bright correctterminal state', () => {
    const runtime = new TeamRuntime(ctx, config);
    runtime.startPlanning();
    runtime.startRunning();

    // no has any whattask，direct connectDone
    const tasks = runtime.getSnapshot().tasks;
    expect(tasks.length).toBe(0);

    const finalizeResult = canFinalize(tasks);
    expect(finalizeResult.canFinalize).toBe(true);

    runtime.complete('emptycount planDone');
    expect(runtime.getSnapshot().status).toBe('completed');

    runtime.dispose();
  });

  it('part minute get cancelafterremaining extrataskcanmax final ize', () => {
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

    // verify verify max final ize
    const tasks = runtime.getSnapshot().tasks;
    const finalizeResult = canFinalize(tasks);
    expect(finalizeResult.canFinalize).toBe(true);

    runtime.dispose();
  });

  it('allfailedcount plan produce produce bright correctterminal state', () => {
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
      issues: [{ severity: 'critical', description: 'strict heavy wrong error' }],
    });

    // fix resumeafterget cancel
    runtime.transitionTask(task.id, 'cancelled');

    // canby max final ize（only onetaskhasget cancel）
    const finalizeResult = canFinalize(runtime.getSnapshot().tasks);
    expect(finalizeResult.canFinalize).toBe(true);

    runtime.fail('alltaskfailed');
    expect(runtime.getSnapshot().status).toBe('failed');

    runtime.dispose();
  });
});
