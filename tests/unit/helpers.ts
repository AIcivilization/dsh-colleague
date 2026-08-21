/**
 * 测试辅助工具 — 创建 mock Context 和最小团队配置
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TeamConfig, MemberConfig } from '../../core/runtime/types';

/**
 * 创建 mock Cordis Context
 */
export function createMockContext(): any {
  return {
    provide: () => {},
    inject: () => {},
    effect: (fn: () => () => void) => fn(),
    on: () => () => {},
    off: () => {},
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
  };
}

/**
 * 创建临时目录作为工作区
 */
export function createTempWorkspace(): string {
  return mkdtempSync(join(tmpdir(), 'colleague-test-'));
}

/**
 * 清理临时目录
 */
export function cleanupWorkspace(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

/**
 * 创建最小成员列表
 */
export function createMockMembers(): MemberConfig[] {
  return [
    {
      id: 'leader-01',
      name: '组长',
      role: 'leader',
      provider: 'dsh',
      slotId: 0,
    },
    {
      id: 'coder-01',
      name: '码农',
      role: 'coder',
      provider: 'dsh',
      slotId: 1,
    },
    {
      id: 'reviewer-01',
      name: '审核员',
      role: 'reviewer',
      provider: 'dsh',
      slotId: 2,
    },
    {
      id: 'tester-01',
      name: '测试员',
      role: 'tester',
      provider: 'dsh',
      slotId: 3,
    },
    {
      id: 'docs-01',
      name: '文档员',
      role: 'docs',
      provider: 'dsh',
      slotId: 4,
    },
  ];
}

/**
 * 创建最小团队配置（不启用持久化）
 */
export function createMockTeamConfig(workspace?: string): TeamConfig {
  return {
    teamId: 'test-team',
    teamName: '测试团队',
    members: createMockMembers(),
    workspace: workspace || createTempWorkspace(),
    maxConcurrentWriters: 1,
    memoryEnabled: false,
  };
}

/**
 * 创建带持久化的团队配置
 */
export function createPersistedMockTeamConfig(workspace?: string): TeamConfig {
  return {
    teamId: 'test-team-persisted',
    teamName: '测试团队（持久化）',
    members: createMockMembers(),
    workspace: workspace || createTempWorkspace(),
    maxConcurrentWriters: 1,
    memoryEnabled: true,
  };
}
