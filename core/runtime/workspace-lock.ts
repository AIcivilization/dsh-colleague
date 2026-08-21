/**
 * 工作区锁 — 串行写入机制
 *
 * 首版采用串行写入：coder 与 coder、coder 与 docs 不可并发写；
 * review/test 仅在依赖完成后并发读取。
 * 产出物通过任务前后的 Git diff 归属。
 */

import { execSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

export interface WorkspaceSnapshot {
  /** Git HEAD commit */
  head: string;
  /** 工作区脏标记 */
  isDirty: boolean;
  /** 变更文件列表 */
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

  /** 预检工作区 */
  precheck(): { ok: boolean; errors: string[] } {
    const errors: string[] = [];

    // 目录存在
    if (!existsSync(this.workspace)) {
      errors.push(`Workspace directory does not exist: ${this.workspace}`);
      return { ok: false, errors };
    }

    const stat = statSync(this.workspace);
    if (!stat.isDirectory()) {
      errors.push(`Workspace path is not a directory: ${this.workspace}`);
      return { ok: false, errors };
    }

    // Git 状态可读
    try {
      execSync('git rev-parse HEAD', {
        cwd: this.workspace,
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'ignore'],
      });
    } catch {
      errors.push(
        `Cannot read Git state in ${this.workspace}. Is it a git repository?`,
      );
    }

    return { ok: errors.length === 0, errors };
  }

  /** 获取工作区快照（任务前） */
  snapshotBefore(taskId: string): WorkspaceSnapshot {
    const snapshot = this.takeSnapshot();
    this.snapshots.set(taskId, snapshot);
    return snapshot;
  }

  /** 获取工作区快照（任务后）并计算 diff */
  snapshotAfter(taskId: string): { before: WorkspaceSnapshot; after: WorkspaceSnapshot; diff: string[] } {
    const before = this.snapshots.get(taskId);
    if (!before) {
      throw new Error(`No before-snapshot for task ${taskId}`);
    }
    const after = this.takeSnapshot();
    const diff = this.computeDiff(before, after);
    return { before, after, diff };
  }

  /** 获取写锁 */
  acquire(taskId: string): boolean {
    if (this.lockedBy !== null) {
      return false;
    }
    this.lockedBy = taskId;
    this.lockedAt = Date.now();
    return true;
  }

  /** 释放写锁 */
  release(taskId: string): void {
    if (this.lockedBy === taskId) {
      this.lockedBy = null;
      this.lockedAt = null;
    }
  }

  /** 检查是否被锁定 */
  isLocked(): boolean {
    return this.lockedBy !== null;
  }

  /** 获取当前锁持有者 */
  getLockHolder(): string | null {
    return this.lockedBy;
  }

  /** 取当前快照 */
  private takeSnapshot(): WorkspaceSnapshot {
    let head = '';
    let isDirty = false;
    let changedFiles: string[] = [];

    try {
      head = execSync('git rev-parse HEAD', {
        cwd: this.workspace,
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();
    } catch {
      // 非 Git 仓库
    }

    try {
      const status = execSync('git status --porcelain', {
        cwd: this.workspace,
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();
      isDirty = status.length > 0;
      changedFiles = status
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => line.slice(3).trim());
    } catch {
      // 非 Git 仓库
    }

    return { head, isDirty, changedFiles };
  }

  /** 计算两个快照之间的 diff */
  private computeDiff(
    before: WorkspaceSnapshot,
    after: WorkspaceSnapshot,
  ): string[] {
    // 如果 HEAD 没变，比较工作区状态
    if (before.head === after.head) {
      // 找出新增的变更文件
      const beforeSet = new Set(before.changedFiles);
      return after.changedFiles.filter((f) => !beforeSet.has(f));
    }

    // HEAD 变了，用 git diff 获取变更
    try {
      const diff = execSync(
        `git diff --name-only ${before.head}..${after.head}`,
        {
          cwd: this.workspace,
          encoding: 'utf-8',
          timeout: 10000,
          stdio: ['pipe', 'pipe', 'ignore'],
        },
      ).trim();
      return diff ? diff.split('\n').filter(Boolean) : [];
    } catch {
      // fallback
      return after.changedFiles;
    }
  }

  /** 清理快照 */
  clearSnapshot(taskId: string): void {
    this.snapshots.delete(taskId);
  }
}
