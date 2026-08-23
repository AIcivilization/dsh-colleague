/**
 * WorkspaceLock — serial write mechanism
 *
 * First version uses serial writes: coder-coder and coder-docs cannot write concurrently.
 * Review/test can read concurrently once dependencies are met.
 * Artifacts are attributed via Git diff before/after the task.
 */

import { execSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { platform } from 'node:os';

// On Windows, git commands need a shell to be found in PATH
const IS_WIN = platform() === 'win32';

const execOpts = (cwd: string, timeout = 5000) => ({
  cwd,
  encoding: 'utf-8' as const,
  timeout,
  stdio: ['pipe', 'pipe', 'ignore'] as ['pipe', 'pipe', 'ignore'],
  shell: IS_WIN ? 'cmd.exe' : undefined,
});

export interface WorkspaceSnapshot {
  /** Git HEAD commit */
  head: string;
  /** Workspace dirty flag */
  isDirty: boolean;
  /** Changed file list */
  changedFiles: string[];
}

export class WorkspaceLock {
  private workspace: string;
  private lockedBy: string | null = null;
  private lockedAt: number | null = null;
  private snapshots = new Map<string, WorkspaceSnapshot>();

  constructor(workspace: string) {
    this.workspace = workspace;
  }

  /** Pre-check workspace */
  precheck(): { ok: boolean; errors: string[] } {
    const errors: string[] = [];

    // Directory exists
    if (!existsSync(this.workspace)) {
      errors.push(`Workspace directory does not exist: ${this.workspace}`);
      return { ok: false, errors };
    }

    const stat = statSync(this.workspace);
    if (!stat.isDirectory()) {
      errors.push(`Workspace path is not a directory: ${this.workspace}`);
      return { ok: false, errors };
    }

    // Git state readable
    try {
      execSync('git rev-parse HEAD', execOpts(this.workspace));
    } catch {
      errors.push(
        `Cannot read Git state in ${this.workspace}. Is it a git repository?`,
      );
    }

    return { ok: errors.length === 0, errors };
  }

  /** Take workspace snapshot (before task) */
  snapshotBefore(taskId: string): WorkspaceSnapshot {
    const snapshot = this.takeSnapshot();
    this.snapshots.set(taskId, snapshot);
    return snapshot;
  }

  /** Take workspace snapshot (after task) and compute diff */
  snapshotAfter(taskId: string): { before: WorkspaceSnapshot; after: WorkspaceSnapshot; diff: string[] } {
    const before = this.snapshots.get(taskId);
    if (!before) {
      throw new Error(`No before-snapshot for task ${taskId}`);
    }
    const after = this.takeSnapshot();
    const diff = this.computeDiff(before, after);
    return { before, after, diff };
  }

  /** Acquire write lock */
  acquire(taskId: string): boolean {
    if (this.lockedBy !== null) {
      return false;
    }
    this.lockedBy = taskId;
    this.lockedAt = Date.now();
    return true;
  }

  /** Release write lock */
  release(taskId: string): void {
    if (this.lockedBy === taskId) {
      this.lockedBy = null;
      this.lockedAt = null;
    }
  }

  /** Check if locked */
  isLocked(): boolean {
    return this.lockedBy !== null;
  }

  /** Get current lock holder */
  getLockHolder(): string | null {
    return this.lockedBy;
  }

  /** Take current snapshot */
  private takeSnapshot(): WorkspaceSnapshot {
    let head = '';
    let isDirty = false;
    let changedFiles: string[] = [];

    try {
      head = execSync('git rev-parse HEAD', execOpts(this.workspace)).trim();
    } catch {
      // Not a Git repo
    }

    try {
      const status = execSync('git status --porcelain', execOpts(this.workspace)).trim();
      isDirty = status.length > 0;
      changedFiles = status
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => line.slice(3).trim());
    } catch {
      // Not a Git repo
    }

    return { head, isDirty, changedFiles };
  }

  /** Compute diff between two snapshots */
  private computeDiff(
    before: WorkspaceSnapshot,
    after: WorkspaceSnapshot,
  ): string[] {
    // If HEAD unchanged, compare workspace status
    if (before.head === after.head) {
      // Find newly changed files
      const beforeSet = new Set(before.changedFiles);
      return after.changedFiles.filter((f) => !beforeSet.has(f));
    }

    // HEAD changed — use git diff to get changes
    try {
      const diff = execSync(
        `git diff --name-only ${before.head}..${after.head}`,
        execOpts(this.workspace, 10000),
      ).trim();
      return diff ? diff.split('\n').filter(Boolean) : [];
    } catch {
      // fallback
      return after.changedFiles;
    }
  }

  /** Clear snapshot */
  clearSnapshot(taskId: string): void {
    this.snapshots.delete(taskId);
  }
}
