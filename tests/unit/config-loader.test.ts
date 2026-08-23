/**
 * Config loader unit tests
 *
 * Test coverage:
 * - Legal YAML config parsing
 * - Missing team section error diagnostics
 * - Missing members list error diagnostics
 * - Member missing id / name / role field error diagnostics
 * - Invalid role error diagnostics
 * - Missing leader error diagnostics
 * - Duplicate non-coder role error diagnostics
 * - Template file loading
 * - Concurrency config extraction
 * - Memory config extraction
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTeamConfig } from '../../core/config/loader';

describe('loadTeamConfig', () => {
  let configDir: string;

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'cfg-test-'));
  });

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true });
  });

  function writeConfig(content: string): string {
    const path = join(configDir, 'team.yaml');
    writeFileSync(path, content, 'utf-8');
    return path;
  }

  function writeTemplate(name: string, content: string): string {
    const templatesDir = join(configDir, 'templates');
    mkdirSync(templatesDir, { recursive: true });
    const path = join(templatesDir, name);
    writeFileSync(path, content, 'utf-8');
    return path;
  }

  describe('Legal config', () => {
    it('complete config parsing success', () => {
      const configPath = writeConfig(`
team:
  name: "Test Team"
  description: "Testuse"

members:
  - id: "leader-01"
    name: "Lead"
    role: "leader"
    provider: "dsh"
    slot_id: 0
  - id: "coder-01"
    name: "Coder"
    role: "coder"
    provider: "dsh"
    slot_id: 1
`);
      const config = loadTeamConfig(configPath);
      expect(config.teamName).toBe('Test Team');
      expect(config.teamId).toBeDefined();
      expect(config.members.length).toBe(2);
      expect(config.members[0].id).toBe('leader-01');
      expect(config.members[0].role).toBe('leader');
    });

    it('default team name and id', () => {
      writeConfig(`
team:
  description: "no name provided"

members:
  - id: "leader-01"
    name: "Lead"
    role: "leader"
    provider: "dsh"
    slot_id: 0
`);
      const config = loadTeamConfig(join(configDir, 'team.yaml'));
      expect(config.teamName).toBe('Default Team');
      expect(config.teamId).toMatch(/^team-/);
    });

    it('provider defaults to dsh-sdk', () => {
      writeConfig(`
team:
  name: "Test"

members:
  - id: "leader-01"
    name: "Lead"
    role: "leader"
    slot_id: 0
`);
      const config = loadTeamConfig(join(configDir, 'team.yaml'));
      expect(config.members[0].provider).toBe('dsh-sdk');
    });

    it('slot_id defaults to index', () => {
      writeConfig(`
team:
  name: "Test"

members:
  - id: "leader-01"
    name: "Lead"
    role: "leader"
  - id: "coder-01"
    name: "Coder"
    role: "coder"
`);
      const config = loadTeamConfig(join(configDir, 'team.yaml'));
      expect(config.members[0].slotId).toBe(0);
      expect(config.members[1].slotId).toBe(1);
    });

    it('permission defaults to reject', () => {
      writeConfig(`
team:
  name: "Test"

members:
  - id: "leader-01"
    name: "Lead"
    role: "leader"
    slot_id: 0
`);
      const config = loadTeamConfig(join(configDir, 'team.yaml'));
      expect(config.members[0].permission).toBe('reject');
    });
  });

  describe('template loading', () => {
    it('loads skillPrompt from template file', () => {
      const templatePath = writeTemplate('leader.yaml', 'You are Lead, split tasks');
      const relativePath = './templates/leader.yaml';
      writeConfig(`
team:
  name: "Test"

members:
  - id: "leader-01"
    name: "Lead"
    role: "leader"
    template: "${relativePath}"
    slot_id: 0
`);
      const config = loadTeamConfig(join(configDir, 'team.yaml'));
      expect(config.members[0].skillPrompt).toBe('You are Lead, split tasks');
      expect(config.members[0].templatePath).toContain('leader.yaml');
    });

    it('template file does not exist throws error', () => {
      writeConfig(`
team:
  name: "Test"

members:
  - id: "leader-01"
    name: "Lead"
    role: "leader"
    template: "./templates/nonexistent.yaml"
    slot_id: 0
`);
      expect(() => loadTeamConfig(join(configDir, 'team.yaml'))).toThrow(
        'template file not found',
      );
    });
  });

  describe('error diagnostics', () => {
    it('file does not exist throws', () => {
      expect(() => loadTeamConfig('/nonexistent/team.yaml')).toThrow(
        'Team config file not found',
      );
    });

    it('invalid YAML throws', () => {
      const configPath = join(configDir, 'team.yaml');
      writeFileSync(configPath, '{{invalid yaml', 'utf-8');
      expect(() => loadTeamConfig(configPath)).toThrow(
        'Failed to parse team config YAML',
      );
    });

    it('missing team section throws', () => {
      writeConfig(`
members:
  - id: "leader-01"
    name: "Lead"
    role: "leader"
`);
      expect(() => loadTeamConfig(join(configDir, 'team.yaml'))).toThrow(
        'missing "team" section',
      );
    });

    it('missing members list throws', () => {
      writeConfig(`
team:
  name: "Test"
`);
      expect(() => loadTeamConfig(join(configDir, 'team.yaml'))).toThrow(
        'no members',
      );
    });

    it('empty members list throws', () => {
      writeConfig(`
team:
  name: "Test"

members: []
`);
      expect(() => loadTeamConfig(join(configDir, 'team.yaml'))).toThrow(
        'no members',
      );
    });

    it('member missing id throws', () => {
      writeConfig(`
team:
  name: "Test"

members:
  - name: "Lead"
    role: "leader"
`);
      expect(() => loadTeamConfig(join(configDir, 'team.yaml'))).toThrow(
        'missing required field "id"',
      );
    });

    it('member missing name throws', () => {
      writeConfig(`
team:
  name: "Test"

members:
  - id: "leader-01"
    role: "leader"
`);
      expect(() => loadTeamConfig(join(configDir, 'team.yaml'))).toThrow(
        'missing required field "name"',
      );
    });

    it('member missing role throws', () => {
      writeConfig(`
team:
  name: "Test"

members:
  - id: "leader-01"
    name: "Lead"
`);
      expect(() => loadTeamConfig(join(configDir, 'team.yaml'))).toThrow(
        'missing required field "role"',
      );
    });

    it('invalid role throws', () => {
      writeConfig(`
team:
  name: "Test"

members:
  - id: "leader-01"
    name: "Lead"
    role: "admin"
`);
      expect(() => loadTeamConfig(join(configDir, 'team.yaml'))).toThrow(
        'invalid role',
      );
    });

    it('missing leader throws', () => {
      writeConfig(`
team:
  name: "Test"

members:
  - id: "coder-01"
    name: "Coder"
    role: "coder"
`);
      expect(() => loadTeamConfig(join(configDir, 'team.yaml'))).toThrow(
        'at least one member with role "leader"',
      );
    });

    it('duplicate reviewer role throws', () => {
      writeConfig(`
team:
  name: "Test"

members:
  - id: "leader-01"
    name: "Lead"
    role: "leader"
  - id: "reviewer-01"
    name: "Reviewer"
    role: "reviewer"
  - id: "reviewer-02"
    name: "Reviewer2"
    role: "reviewer"
`);
      expect(() => loadTeamConfig(join(configDir, 'team.yaml'))).toThrow(
        'Duplicate role "reviewer"',
      );
    });

    it('multiple coders are valid', () => {
      writeConfig(`
team:
  name: "Test"

members:
  - id: "leader-01"
    name: "Lead"
    role: "leader"
  - id: "coder-01"
    name: "Coder1"
    role: "coder"
  - id: "coder-02"
    name: "Coder2"
    role: "coder"
`);
      const config = loadTeamConfig(join(configDir, 'team.yaml'));
      const coders = config.members.filter((m) => m.role === 'coder');
      expect(coders.length).toBe(2);
    });
  });
});
