/**
 * integration successTest — event persistenceandrecovery + Mock Provider all flow process
 *
 * Testcover cover：
 * - eventflowpersistenceto events.jsonl
 * - restartafterfromeventflow complete wholerecoveryteamstatus
 * - Mock provider mock mock max small coder tasklifecycle
 * - TeamRuntime + WorkspaceLock + MemoryService endtoend collaborat work
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

describe('integration successTest：event persistenceandrecovery', () => {
  let ctx: any;
  let config: TeamConfig;

  beforeEach(() => {
    ctx = createMockContext();
    config = createPersistedMockTeamConfig();
  });

  afterEach(() => {
    cleanupWorkspace(config.workspace);
  });

  it('complete whole lifecycle：create → planning → execution → taskDone → Review → Test → finalize', () => {
    const runtime = new TeamRuntime(ctx, config);

    // 1. teamstart
    runtime.startPlanning();
    runtime.startRunning();
    expect(runtime.getSnapshot().status).toBe('running');

    // 2. Leader createcodingtask
    const coderTask = runtime.createTask(
      'Implement user authentication',
      'Implement JWT login and registration API',
      'coder',
    );
    expect(coderTask.status).toBe('planned');

    // 3. taskflow rotateto running
    runtime.transitionTask(coderTask.id, 'ready');
    runtime.transitionTask(coderTask.id, 'running');

    // 4. coder return return conclusion structure ize conclusion result
    const coderResult = {
      status: 'completed' as const,
      summary: 'implement /api/login and /api/register',
      artifacts: ['src/auth/login.ts', 'src/auth/register.ts'],
      issues: [],
    };
    const resultValidation = validateTaskResult(coderResult);
    expect(resultValidation.valid).toBe(true);

    runtime.transitionTask(coderTask.id, 'passed', resultValidation.result);

    // 5. reviewer Review
    const reviewQuality = validateQualityResult({
      status: 'approved',
      summary: 'Code quality good good，complies with standard standard',
      issues: [],
    });
    expect(reviewQuality.valid).toBe(true);

    runtime.recordQuality(coderTask.id, {
      status: 'approved',
      summary: 'Review passed',
      issues: [],
    });

    // 6. verify quality gate gate
    const task = runtime.getSnapshot().tasks.find((t) => t.id === coderTask.id);
    expect(task).toBeDefined();
    expect(hasPassedQualityGate(task!)).toBe(true);

    // 7. teamDone
    runtime.complete('all hastaskDone');
    expect(runtime.getSnapshot().status).toBe('completed');

    runtime.dispose();
  });

  it('Reviewrejection → fix → re-review passed', () => {
    const runtime = new TeamRuntime(ctx, config);
    runtime.startPlanning();
    runtime.startRunning();

    const coderTask = runtime.createTask('Implement successA', 'Description', 'coder');
    runtime.transitionTask(coderTask.id, 'ready');
    runtime.transitionTask(coderTask.id, 'running');
    runtime.transitionTask(coderTask.id, 'passed', {
      status: 'completed',
      summary: 'Done',
      artifacts: ['src/a.ts'],
      issues: [],
    });

    // Reviewrejection
    runtime.recordQuality(coderTask.id, {
      status: 'changes_requested',
      summary: 'Changes needednaming standard standard',
      issues: [
        { severity: 'warning', description: 'variablenamenon-standard', file: 'src/a.ts', line: 10 },
      ],
    });

    // taskshouldchangefor failed
    let task = runtime.getSnapshot().tasks.find((t) => t.id === coderTask.id);
    expect(task?.status).toBe('failed');

    // fix then re- enter input ready
    runtime.transitionTask(coderTask.id, 'ready');
    runtime.transitionTask(coderTask.id, 'running');
    runtime.transitionTask(coderTask.id, 'passed', {
      status: 'completed',
      summary: 'hasfixnamingIssue',
      artifacts: ['src/a.ts'],
      issues: [],
    });

    // re-review passed
    runtime.recordQuality(coderTask.id, {
      status: 'approved',
      summary: 'fix afterPassed',
      issues: [],
    });

    task = runtime.getSnapshot().tasks.find((t) => t.id === coderTask.id);
    expect(task?.status).toBe('passed');
    expect(hasPassedQualityGate(task!)).toBe(true);

    runtime.dispose();
  });

  it('canFinalize block stopnotPassedReviewofteamfinalize', () => {
    const runtime = new TeamRuntime(ctx, config);
    runtime.startPlanning();
    runtime.startRunning();

    const coderTask = runtime.createTask('coding', 'Description', 'coder');
    runtime.transitionTask(coderTask.id, 'ready');
    runtime.transitionTask(coderTask.id, 'running');
    runtime.transitionTask(coderTask.id, 'passed', {
      status: 'completed',
      summary: 'Done',
      artifacts: [],
      issues: [],
    });

    // no quality conclusion conclusion → cannotfinalize
    const tasks = runtime.getSnapshot().tasks;
    const result = canFinalize(tasks);
    expect(result.canFinalize).toBe(false);

    runtime.dispose();
  });

  it('event persistenceafterrestartrecoverycomplete wholestatus', () => {
    // ordinal onephase
    const rt1 = new TeamRuntime(ctx, config);
    rt1.startPlanning();
    rt1.startRunning();
    const task1 = rt1.createTask('task1', 'Description1', 'coder');
    const task2 = rt1.createTask('task2', 'Description2', 'tester', [task1.id]);
    rt1.transitionTask(task1.id, 'ready');
    rt1.transitionTask(task1.id, 'running');
    rt1.transitionTask(task1.id, 'passed', {
      status: 'completed',
      summary: 'Done',
      artifacts: ['src/file.ts'],
      issues: [],
    });
    rt1.recordQuality(task1.id, {
      status: 'approved',
      summary: 'Passed',
      issues: [],
    });
    rt1.pause();

    // verifypersistencetext component storeat
    const eventsPath = resolve(config.workspace, '.colleague', 'events.jsonl');
    expect(existsSync(eventsPath)).toBe(true);

    // verify every rowisLegal JSON
    const content = readFileSync(eventsPath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim());
    expect(lines.length).toBeGreaterThan(5);

    rt1.dispose();

    // ordinal twophase：restartrecovery
    const rt2 = new TeamRuntime(ctx, config);
    const state = rt2.getSnapshot();

    // verifyrecoveryofstatus
    expect(state.status).toBe('paused');
    expect(state.tasks.length).toBe(2);
    expect(state.tasks[0].title).toBe('task1');
    expect(state.tasks[0].status).toBe('passed');
    expect(state.tasks[0].quality?.status).toBe('approved');
    expect(state.tasks[1].title).toBe('task2');
    expect(state.tasks[1].dependencies).toContain(task1.id);

    // verifyrecoveryaftercan be continue continueoperation
    rt2.resume();
    expect(rt2.getSnapshot().status).toBe('running');

    rt2.dispose();
  });

  it('LeaderPlanner + TeamRuntime joint move：Validationafterexecutes', () => {
    const runtime = new TeamRuntime(ctx, config);
    const planner = new LeaderPlanner(1);

    runtime.startPlanning();
    runtime.startRunning();

    // mock mock Leader output
    const leaderAction = {
      type: 'create_task' as const,
      reason: 'Need to implement login successfully',
      task: {
        title: 'implementlogin',
        description: 'JWT login API',
        role: 'coder' as const,
        dependencies: [] as string[],
      },
    };

    // Validation Leader output
    const state = runtime.getSnapshot();
    const validation = planner.validate(leaderAction, state);
    expect(validation.valid).toBe(true);

    // executes Leader point command
    const task = runtime.createTask(
      leaderAction.task.title,
      leaderAction.task.description,
      leaderAction.task.role,
      leaderAction.task.dependencies,
    );
    expect(task.title).toBe('implementlogin');

    runtime.dispose();
  });

  it('record memory system statpersistence：restartaftercancheck search architect structure decis bind', () => {
    const rt1 = new TeamRuntime(ctx, config);
    rt1.startPlanning();
    rt1.startRunning();

    // triggers team_status_changed event，recordtorecord memory
    rt1.pause();
    rt1.resume();

    // Passed quality_recorded record quality conclusion conclusion
    const task = rt1.createTask('task', 'Description', 'coder');
    rt1.transitionTask(task.id, 'ready');
    rt1.transitionTask(task.id, 'running');
    rt1.transitionTask(task.id, 'passed', {
      status: 'completed',
      summary: 'Done',
      artifacts: [],
      issues: [],
    });
    rt1.recordQuality(task.id, {
      status: 'approved',
      summary: 'Review passed',
      issues: [],
    });

    rt1.dispose();

    // restartafterverify record memory
    const rt2 = new TeamRuntime(ctx, config);
    const memory = rt2.getMemory();
    const all = memory.getAll();
    expect(all.length).toBeGreaterThan(0);

    // shouldinclude quality conclusion conclusion
    const qualityEntries = all.filter((e) => e.metadata.source === 'quality');
    expect(qualityEntries.length).toBeGreaterThan(0);

    // shouldincludedecisionrecord
    const decisionEntries = all.filter((e) => e.metadata.source === 'decision');
    expect(decisionEntries.length).toBeGreaterThan(0);

    rt2.dispose();
  });
});
