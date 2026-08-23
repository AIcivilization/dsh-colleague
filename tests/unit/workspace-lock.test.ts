/**
 * WorkspaceLock single unitTest
 *
 * Testcover cover：
 * - acquire/release serialwrite
 * - duplicate acquire return return false
 * - not hold has or release invalid
 * - isLocked / getLockHolder
 * - precheck（item record storeat、Git  ）
 * - snapshotBefore / snapshotAfter / computeDiff
 * - cleanSnapshot
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
    // initial initial ize git  
    execSync('git init', { cwd: workspace, stdio: 'pipe' });
    execSync('git config user.email test@test.com', { cwd: workspace, stdio: 'pipe' });
    execSync('git config user.name Test', { cwd: workspace, stdio: 'pipe' });
    // createinitial initial submit submit
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

    it('haslockwhen acquire return return false', () => {
      lock.acquire('task-001');
      expect(lock.acquire('task-002')).toBe(false);
      expect(lock.getLockHolder()).toBe('task-001');
    });

    it('hold has or release success', () => {
      lock.acquire('task-001');
      lock.release('task-001');
      expect(lock.isLocked()).toBe(false);
      expect(lock.getLockHolder()).toBeNull();
    });

    it('not hold has or release invalid', () => {
      lock.acquire('task-001');
      lock.release('task-002'); // notishold has or
      expect(lock.isLocked()).toBe(true);
      expect(lock.getLockHolder()).toBe('task-001');
    });

    it('release aftercanagain time acquire', () => {
      lock.acquire('task-001');
      lock.release('task-001');
      expect(lock.acquire('task-002')).toBe(true);
      expect(lock.getLockHolder()).toBe('task-002');
    });
  });

  describe('precheck', () => {
    it('Legal git  Passed precheck', () => {
      const result = lock.precheck();
      expect(result.ok).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('item recorddoes not existwhen precheck failed', () => {
      const badLock = new WorkspaceLock('/nonexistent/path');
      const result = badLock.precheck();
      expect(result.ok).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('not git  when precheck failed', () => {
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
      expect(snapshot.head.length).toBe(40); // git hash long degree
    });

    it('snapshotAfter count compute diff（no change updatewhen diff forempty）', () => {
      lock.snapshotBefore('task-001');
      const { before, after, diff } = lock.snapshotAfter('task-001');
      expect(before.head).toBe(after.head);
      expect(diff.length).toBe(0);
    });

    it('snapshotAfter count compute diff（has new text component change update）', () => {
      lock.snapshotBefore('task-001');
      // createnew text component
      writeFileSync(join(workspace, 'new-file.ts'), 'export const x = 1;\n');
      const { before, after, diff } = lock.snapshotAfter('task-001');
      // HEAD no change butworkspacehas change update
      expect(before.head).toBe(after.head);
      expect(after.isDirty).toBe(true);
      expect(diff.length).toBeGreaterThan(0);
      expect(diff.some((f) => f.includes('new-file.ts'))).toBe(true);
    });

    it('snapshotAfter count compute diff（has commit change update）', () => {
      lock.snapshotBefore('task-001');
      // createnew text component and submit submit
      writeFileSync(join(workspace, 'feature.ts'), 'export const y = 2;\n');
      execSync('git add .', { cwd: workspace, stdio: 'pipe' });
      execSync('git commit -m "feature"', { cwd: workspace, stdio: 'pipe' });
      const { before, after, diff } = lock.snapshotAfter('task-001');
      // HEAD change
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
    it('clearedafter snapshotAfter throws', () => {
      lock.snapshotBefore('task-001');
      lock.clearSnapshot('task-001');
      expect(() => lock.snapshotAfter('task-001')).toThrow(
        'No before-snapshot for task task-001',
      );
    });
  });
});
