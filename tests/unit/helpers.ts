/**
 * Test helpers — create mock Context and minimal team config
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TeamConfig, MemberConfig } from '../../core/runtime/types';

/**
 * Create a mock Cordis Context
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
 * Create a temporary directory as workspace
 */
export function createTempWorkspace(): string {
  return mkdtempSync(join(tmpdir(), 'colleague-test-'));
}

/**
 * Clean up temporary directory
 */
export function cleanupWorkspace(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

/**
 * Create a minimal member list
 */
export function createMockMembers(): MemberConfig[] {
  return [
    {
      id: 'leader-01',
      name: 'Lead',
      role: 'leader',
      provider: 'dsh-sdk',
      slotId: 0,
    },
    {
      id: 'coder-01',
      name: 'Coder',
      role: 'coder',
      provider: 'dsh-sdk',
      slotId: 1,
    },
    {
      id: 'reviewer-01',
      name: 'Reviewer',
      role: 'reviewer',
      provider: 'dsh-sdk',
      slotId: 2,
    },
    {
      id: 'tester-01',
      name: 'Tester',
      role: 'tester',
      provider: 'dsh-sdk',
      slotId: 3,
    },
    {
      id: 'docs-01',
      name: 'Doc Writer',
      role: 'docs',
      provider: 'dsh-sdk',
      slotId: 4,
    },
  ];
}

/**
 * Create a minimal team config (persistence disabled)
 */
export function createMockTeamConfig(workspace?: string): TeamConfig {
  return {
    teamId: 'test-team',
    teamName: 'Test Team',
    members: createMockMembers(),
    workspace: workspace || createTempWorkspace(),
    maxConcurrentWriters: 1,
    memoryEnabled: false,
  };
}

/**
 * Create a team config with persistence enabled
 */
export function createPersistedMockTeamConfig(workspace?: string): TeamConfig {
  return {
    teamId: 'test-team-persisted',
    teamName: 'Test Team (Persisted)',
    members: createMockMembers(),
    workspace: workspace || createTempWorkspace(),
    maxConcurrentWriters: 1,
    memoryEnabled: true,
  };
}
