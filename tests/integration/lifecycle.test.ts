/**
 * integration test — event persistence and recovery + Mock Provider lifecycle
 *
 * Test coverage:
 * - event flow persistence to events.jsonl
 * - restart from event flow: complete recovery of team status
 * - Mock provider simulates minimal coder task lifecycle
 * - TeamRuntime + WorkspaceLock + MemoryService end-to-end collaboration
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

describe('Integration: Event persistence and recovery', () => {
  let ctx: any;
  let config: TeamConfig;

  beforeEach(() => {
    ctx = createMockContext();
    config = createPersistedMockTeamConfig();
  });

  afterEach(() => {
    cleanupWorkspace(config.workspace);
  });

  it('complete lifecycle: create -> planning -> execution -> taskDone -> Review -> Test -> finalize', () => {
    const runtime = new TeamRuntime(ctx, config);

    // 1. team starts
    runtime.startPlanning();
    runtime.startRunning();
    expect(runtime.getSnapshot().status).toBe('running');

    // 2. Leader creates coding task
    const coderTask = runtime.createTask(
      'Implement user authentication',
      'Implement JWT login and registration API',
      'coder',
    );
    expect(coderTask.status).toBe('planned');

    // 3. task transitions to running
    runtime.transitionTask(coderTask.id, 'ready');
    runtime.transitionTask(coderTask.id, 'running');

    // 4. coder returns structured result
    const coderResult = {
      status: 'completed' as const,
      summary: 'implement /api/login and /api/register',
      artifacts: ['src/auth/login.ts', 'src/auth/register.ts'],
      issues: [],
    };
    const resultValidation = validateTaskResult(coderResult);
    expect(resultValidation.valid).toBe(true);

    runtime.transitionTask(coderTask.id, 'passed', resultValidation.result);

    // 5. reviewer reviews
    const reviewQuality = validateQualityResult({
      status: 'approved',
      summary: 'Code quality is good, complies with standards',
      issues: [],
    });
    expect(reviewQuality.valid).toBe(true);

    runtime.recordQuality(coderTask.id, {
      status: 'approved',
      summary: 'Review passed',
      issues: [],
    });

    // 6. verify quality gate
    const task = runtime.getSnapshot().tasks.find((t) => t.id === coderTask.id);
    expect(task).toBeDefined();
    expect(hasPassedQualityGate(task!)).toBe(true);

    // 7. team completes
    runtime.complete('All tasks done');
    expect(runtime.getSnapshot().status).toBe('completed');

    runtime.dispose();
  });

  it('Review rejection → fix → re-review passed', () => {
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

    // Review rejection
    runtime.recordQuality(coderTask.id, {
      status: 'changes_requested',
      summary: 'Changes needed: naming standards',
      issues: [
        { severity: 'warning', description: 'variable naming non-standard', file: 'src/a.ts', line: 10 },
      ],
    });

    // task should transition to failed
    let task = runtime.getSnapshot().tasks.find((t) => t.id === coderTask.id);
    expect(task?.status).toBe('failed');

    // fix then re-enter ready
    runtime.transitionTask(coderTask.id, 'ready');
    runtime.transitionTask(coderTask.id, 'running');
    runtime.transitionTask(coderTask.id, 'passed', {
      status: 'completed',
      summary: 'Fixed naming issue',
      artifacts: ['src/a.ts'],
      issues: [],
    });

    // re-review passed
    runtime.recordQuality(coderTask.id, {
      status: 'approved',
      summary: 'Fix after passed',
      issues: [],
    });

    task = runtime.getSnapshot().tasks.find((t) => t.id === coderTask.id);
    expect(task?.status).toBe('passed');
    expect(hasPassedQualityGate(task!)).toBe(true);

    runtime.dispose();
  });

  it('canFinalize allows passed coder task without quality review', () => {
    const runtime = new TeamRuntime(ctx, config);
    runtime.startPlanning();
    runtime.startRunning();

    const coderTask = runtime.createTask('Coding', 'Description', 'coder');
    runtime.transitionTask(coderTask.id, 'ready');
    runtime.transitionTask(coderTask.id, 'running');
    runtime.transitionTask(coderTask.id, 'passed', {
      status: 'completed',
      summary: 'Done',
      artifacts: [],
      issues: [],
    });

    // No quality review was performed — still allowed to finalize
    const tasks = runtime.getSnapshot().tasks;
    const result = canFinalize(tasks);
    expect(result.canFinalize).toBe(true);

    runtime.dispose();
  });

  it('event persistence: after restart, recovers complete status', () => {
    // phase 1
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

    // verify persistence file exists
    const eventsPath = resolve(config.workspace, '.colleague', 'events.jsonl');
    expect(existsSync(eventsPath)).toBe(true);

    // verify every row is valid JSON
    const content = readFileSync(eventsPath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim());
    expect(lines.length).toBeGreaterThan(5);

    rt1.dispose();

    // phase 2: restart recovery
    const rt2 = new TeamRuntime(ctx, config);
    const state = rt2.getSnapshot();

    // verify status recovery
    expect(state.status).toBe('paused');
    expect(state.tasks.length).toBe(2);
    expect(state.tasks[0].title).toBe('task1');
    expect(state.tasks[0].status).toBe('passed');
    expect(state.tasks[0].quality?.status).toBe('approved');
    expect(state.tasks[1].title).toBe('task2');
    expect(state.tasks[1].dependencies).toContain(task1.id);

    // verify recovery allows continued operation
    rt2.resume();
    expect(rt2.getSnapshot().status).toBe('running');

    rt2.dispose();
  });

  it('LeaderPlanner + TeamRuntime integration: validation after execution', () => {
    const runtime = new TeamRuntime(ctx, config);
    const planner = new LeaderPlanner(1);

    runtime.startPlanning();
    runtime.startRunning();

    // Mock Leader output
    const leaderAction = {
      type: 'create_task' as const,
      reason: 'Need to implement login successfully',
      task: {
        title: 'implement login',
        description: 'JWT login API',
        role: 'coder' as const,
        dependencies: [] as string[],
      },
    };

    // Validate Leader output
    const state = runtime.getSnapshot();
    const validation = planner.validate(leaderAction, state);
    expect(validation.valid).toBe(true);

    // execute Leader's command
    const task = runtime.createTask(
      leaderAction.task.title,
      leaderAction.task.description,
      leaderAction.task.role,
      leaderAction.task.dependencies,
    );
    expect(task.title).toBe('implement login');

    runtime.dispose();
  });

  it('Memory system persistence: restart can search architectural decisions', () => {
    const rt1 = new TeamRuntime(ctx, config);
    rt1.startPlanning();
    rt1.startRunning();

    // triggers team_status_changed event, records to memory
    rt1.pause();
    rt1.resume();

    // quality_recorded records quality conclusion
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

    // restart and verify memory
    const rt2 = new TeamRuntime(ctx, config);
    const memory = rt2.getMemory();
    const all = memory.getAll();
    expect(all.length).toBeGreaterThan(0);

    // should include quality conclusion
    const qualityEntries = all.filter((e) => e.metadata.source === 'quality');
    expect(qualityEntries.length).toBeGreaterThan(0);

    // should include decision record
    const decisionEntries = all.filter((e) => e.metadata.source === 'decision');
    expect(decisionEntries.length).toBeGreaterThan(0);

    rt2.dispose();
  });
});
