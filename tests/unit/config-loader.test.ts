/**
 * configloaddevice single unitTest
 *
 * Testcover cover：
 * - Legal YAML configparsing
 * - missing team segment errordiagnostics
 * - missing members listerrordiagnostics
 * - membermissing id / name / role fielderrordiagnostics
 * - illegal roleerrordiagnostics
 * - Missing leader errordiagnostics
 * - duplicatenot coder roleerrordiagnostics
 * - templatetext componentload
 * - concurrencyconfigextraction
 * - record memoryconfigextraction
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

  describe('Legalconfig', () => {
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

    it('provider defaultfor dsh', () => {
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
      expect(config.members[0].provider).toBe('dsh');
    });

    it('slot_id defaultfor index', () => {
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

    it('permissiondefaultfor reject', () => {
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

  describe('templateload', () => {
    it('fromtemplatetext componentload skillPrompt', () => {
      const templatePath = writeTemplate('leader.yaml', 'yourisLead，  split task');
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
      expect(config.members[0].skillPrompt).toBe('yourisLead，  split task');
      expect(config.members[0].templatePath).toContain('leader.yaml');
    });

    it('templateFile does not existthrowserror', () => {
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

  describe('errordiagnostics', () => {
    it('File does not existthrows', () => {
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

    it('Missing team segmentthrows', () => {
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

    it('Missing members listthrows', () => {
      writeConfig(`
team:
  name: "Test"
`);
      expect(() => loadTeamConfig(join(configDir, 'team.yaml'))).toThrow(
        'no members',
      );
    });

    it('empty members listthrows', () => {
      writeConfig(`
team:
  name: "Test"

members: []
`);
      expect(() => loadTeamConfig(join(configDir, 'team.yaml'))).toThrow(
        'no members',
      );
    });

    it('memberMissing id throws', () => {
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

    it('memberMissing name throws', () => {
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

    it('memberMissing role throws', () => {
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

    it('illegal rolethrows', () => {
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

    it('Missing leader throws', () => {
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

    it('duplicate reviewer rolethrows', () => {
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

    it('multiple coder Legal', () => {
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
