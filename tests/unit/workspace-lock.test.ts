/**
 * WorkspaceLock unit tests
 *
 * Test coverage:
 * - acquire/release serial write lock
 * - duplicate acquire returns false
 * - release by non-holder is invalid
 * - isLocked / getLockHolder
 * - precheck (file integrity, git)
 * - snapshotBefore / snapshotAfter / computeDiff
 * - clearSnapshot
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceLock } from '../../core/runtime/workspace-lock';

describe('WorkspaceLock', () => {
  let workspace: string;
  let lock: WorkspaceLock;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'ws-lock-test-'));
    // initialize git repo
    execSync('git init', { cwd: workspace, stdio: 'pipe' });
    execSync('git config user.email test@test.com', { cwd: workspace, stdio: 'pipe' });
    execSync('git config user.name Test', { cwd: workspace, stdio: 'pipe' });
    // create initial commit
    writeFileSync(join(workspace, 'README.md'), '# Test\n');
    execSync('git add .', { cwd: workspace, stdio: 'pipe' });
    execSync('git commit -m "init"', { cwd: workspace, stdio: 'pipe' });
    lock = new WorkspaceLock(workspace);
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  describe('acquire / release', () => {
    it('first time acquire success', () => {
      expect(lock.acquire('task-001')).toBe(true);
      expect(lock.isLocked()).toBe(true);
      expect(lock.getLockHolder()).toBe('task-001');
    });

    it('locked workspace acquire returns false', () => {
      lock.acquire('task-001');
      expect(lock.acquire('task-002')).toBe(false);
      expect(lock.getLockHolder()).toBe('task-001');
    });

    it('holder release succeeds', () => {
      lock.acquire('task-001');
      lock.release('task-001');
      expect(lock.isLocked()).toBe(false);
      expect(lock.getLockHolder()).toBeNull();
    });

    it('non-holder release is invalid', () => {
      lock.acquire('task-001');
      lock.release('task-002'); // not the holder
      expect(lock.isLocked()).toBe(true);
      expect(lock.getLockHolder()).toBe('task-001');
    });

    it('release allows re-acquire', () => {
      lock.acquire('task-001');
      lock.release('task-001');
      expect(lock.acquire('task-002')).toBe(true);
      expect(lock.getLockHolder()).toBe('task-002');
    });
  });

  describe('precheck', () => {
    it('valid git repo passes precheck', () => {
      const result = lock.precheck();
      expect(result.ok).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('non-existent path fails precheck', () => {
      const badLock = new WorkspaceLock('/nonexistent/path');
      const result = badLock.precheck();
      expect(result.ok).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('non-git directory fails precheck', () => {
      const nonGitDir = mkdtempSync(join(tmpdir(), 'non-git-'));
      const nonGitLock = new WorkspaceLock(nonGitDir);
      const result = nonGitLock.precheck();
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes('git'))).toBe(true);
      rmSync(nonGitDir, { recursive: true, force: true });
    });
  });

  describe('snapshotBefore / snapshotAfter', () => {
    it('snapshotBefore record HEAD', () => {
      const snapshot = lock.snapshotBefore('task-001');
      expect(snapshot.head).toBeTruthy();
      expect(snapshot.head.length).toBe(40); // git commit hash length
    });

    it('snapshotAfter computes diff (no change → empty diff)', () => {
      lock.snapshotBefore('task-001');
      const { before, after, diff } = lock.snapshotAfter('task-001');
      expect(before.head).toBe(after.head);
      expect(diff.length).toBe(0);
    });

    it('snapshotAfter computes diff (new text changes)', () => {
      lock.snapshotBefore('task-001');
      // create new file
      writeFileSync(join(workspace, 'new-file.ts'), 'export const x = 1;\n');
      const { before, after, diff } = lock.snapshotAfter('task-001');
      // HEAD unchanged but workspace has changes
      expect(before.head).toBe(after.head);
      expect(after.isDirty).toBe(true);
      expect(diff.length).toBeGreaterThan(0);
      expect(diff.some((f) => f.includes('new-file.ts'))).toBe(true);
    });

    it('snapshotAfter computes diff (commit changes)', () => {
      lock.snapshotBefore('task-001');
      // create new file and commit
      writeFileSync(join(workspace, 'feature.ts'), 'export const y = 2;\n');
      execSync('git add .', { cwd: workspace, stdio: 'pipe' });
      execSync('git commit -m "feature"', { cwd: workspace, stdio: 'pipe' });
      const { before, after, diff } = lock.snapshotAfter('task-001');
      // HEAD changed
      expect(before.head).not.toBe(after.head);
      expect(diff.length).toBeGreaterThan(0);
      expect(diff.some((f) => f.includes('feature.ts'))).toBe(true);
    });

    it('no before-snapshot when snapshotAfter throws', () => {
      expect(() => lock.snapshotAfter('nonexistent')).toThrow(
        'No before-snapshot for task nonexistent',
      );
    });
  });

  describe('cleanSnapshot', () => {
    it('clearSnapshot removes the before-snapshot', () => {
      lock.snapshotBefore('task-001');
      lock.clearSnapshot('task-001');
      expect(() => lock.snapshotAfter('task-001')).toThrow(
        'No before-snapshot for task task-001',
      );
    });
  });
});
