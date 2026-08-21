/**
 * WorkspaceLock 单元测试
 *
 * 测试覆盖：
 * - acquire/release 串行写入
 * - 重复 acquire 返回 false
 * - 非持有者 release 无效
 * - isLocked / getLockHolder
 * - precheck（目录存在、Git 仓库）
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
    // 初始化 git 仓库
    execSync('git init', { cwd: workspace, stdio: 'pipe' });
    execSync('git config user.email test@test.com', { cwd: workspace, stdio: 'pipe' });
    execSync('git config user.name Test', { cwd: workspace, stdio: 'pipe' });
    // 创建初始提交
    writeFileSync(join(workspace, 'README.md'), '# Test\n');
    execSync('git add .', { cwd: workspace, stdio: 'pipe' });
    execSync('git commit -m "init"', { cwd: workspace, stdio: 'pipe' });
    lock = new WorkspaceLock(workspace);
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  describe('acquire / release', () => {
    it('首次 acquire 成功', () => {
      expect(lock.acquire('task-001')).toBe(true);
      expect(lock.isLocked()).toBe(true);
      expect(lock.getLockHolder()).toBe('task-001');
    });

    it('已锁时 acquire 返回 false', () => {
      lock.acquire('task-001');
      expect(lock.acquire('task-002')).toBe(false);
      expect(lock.getLockHolder()).toBe('task-001');
    });

    it('持有者 release 成功', () => {
      lock.acquire('task-001');
      lock.release('task-001');
      expect(lock.isLocked()).toBe(false);
      expect(lock.getLockHolder()).toBeNull();
    });

    it('非持有者 release 无效', () => {
      lock.acquire('task-001');
      lock.release('task-002'); // 不是持有者
      expect(lock.isLocked()).toBe(true);
      expect(lock.getLockHolder()).toBe('task-001');
    });

    it('release 后可再次 acquire', () => {
      lock.acquire('task-001');
      lock.release('task-001');
      expect(lock.acquire('task-002')).toBe(true);
      expect(lock.getLockHolder()).toBe('task-002');
    });
  });

  describe('precheck', () => {
    it('合法 git 仓库通过 precheck', () => {
      const result = lock.precheck();
      expect(result.ok).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('目录不存在时 precheck 失败', () => {
      const badLock = new WorkspaceLock('/nonexistent/path');
      const result = badLock.precheck();
      expect(result.ok).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('非 git 仓库时 precheck 失败', () => {
      const nonGitDir = mkdtempSync(join(tmpdir(), 'non-git-'));
      const nonGitLock = new WorkspaceLock(nonGitDir);
      const result = nonGitLock.precheck();
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes('git'))).toBe(true);
      rmSync(nonGitDir, { recursive: true, force: true });
    });
  });

  describe('snapshotBefore / snapshotAfter', () => {
    it('snapshotBefore 记录 HEAD', () => {
      const snapshot = lock.snapshotBefore('task-001');
      expect(snapshot.head).toBeTruthy();
      expect(snapshot.head.length).toBe(40); // git hash 长度
    });

    it('snapshotAfter 计算 diff（无变更时 diff 为空）', () => {
      lock.snapshotBefore('task-001');
      const { before, after, diff } = lock.snapshotAfter('task-001');
      expect(before.head).toBe(after.head);
      expect(diff.length).toBe(0);
    });

    it('snapshotAfter 计算 diff（有新文件变更）', () => {
      lock.snapshotBefore('task-001');
      // 创建新文件
      writeFileSync(join(workspace, 'new-file.ts'), 'export const x = 1;\n');
      const { before, after, diff } = lock.snapshotAfter('task-001');
      // HEAD 没变但工作区有变更
      expect(before.head).toBe(after.head);
      expect(after.isDirty).toBe(true);
      expect(diff.length).toBeGreaterThan(0);
      expect(diff.some((f) => f.includes('new-file.ts'))).toBe(true);
    });

    it('snapshotAfter 计算 diff（有 commit 变更）', () => {
      lock.snapshotBefore('task-001');
      // 创建新文件并提交
      writeFileSync(join(workspace, 'feature.ts'), 'export const y = 2;\n');
      execSync('git add .', { cwd: workspace, stdio: 'pipe' });
      execSync('git commit -m "feature"', { cwd: workspace, stdio: 'pipe' });
      const { before, after, diff } = lock.snapshotAfter('task-001');
      // HEAD 变了
      expect(before.head).not.toBe(after.head);
      expect(diff.length).toBeGreaterThan(0);
      expect(diff.some((f) => f.includes('feature.ts'))).toBe(true);
    });

    it('无 before-snapshot 时 snapshotAfter 抛出', () => {
      expect(() => lock.snapshotAfter('nonexistent')).toThrow(
        'No before-snapshot for task nonexistent',
      );
    });
  });

  describe('clearSnapshot', () => {
    it('清除后 snapshotAfter 抛出', () => {
      lock.snapshotBefore('task-001');
      lock.clearSnapshot('task-001');
      expect(() => lock.snapshotAfter('task-001')).toThrow(
        'No before-snapshot for task task-001',
      );
    });
  });
});
