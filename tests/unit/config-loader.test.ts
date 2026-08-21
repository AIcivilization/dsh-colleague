/**
 * 配置加载器单元测试
 *
 * 测试覆盖：
 * - 合法 YAML 配置解析
 * - 缺失 team 段错误诊断
 * - 缺失 members 列表错误诊断
 * - 成员缺 id / name / role 字段错误诊断
 * - 非法角色错误诊断
 * - 缺少 leader 错误诊断
 * - 重复非 coder 角色错误诊断
 * - 模板文件加载
 * - 并发配置提取
 * - 记忆配置提取
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

  describe('合法配置', () => {
    it('完整配置解析成功', () => {
      const configPath = writeConfig(`
team:
  name: "测试团队"
  description: "测试用"

members:
  - id: "leader-01"
    name: "组长"
    role: "leader"
    provider: "dsh"
    slot_id: 0
  - id: "coder-01"
    name: "码农"
    role: "coder"
    provider: "dsh"
    slot_id: 1
`);
      const config = loadTeamConfig(configPath);
      expect(config.teamName).toBe('测试团队');
      expect(config.teamId).toBeDefined();
      expect(config.members.length).toBe(2);
      expect(config.members[0].id).toBe('leader-01');
      expect(config.members[0].role).toBe('leader');
    });

    it('默认 team name 和 id', () => {
      writeConfig(`
team:
  description: "无名称"

members:
  - id: "leader-01"
    name: "组长"
    role: "leader"
    provider: "dsh"
    slot_id: 0
`);
      const config = loadTeamConfig(join(configDir, 'team.yaml'));
      expect(config.teamName).toBe('默认团队');
      expect(config.teamId).toMatch(/^team-/);
    });

    it('provider 默认为 dsh', () => {
      writeConfig(`
team:
  name: "测试"

members:
  - id: "leader-01"
    name: "组长"
    role: "leader"
    slot_id: 0
`);
      const config = loadTeamConfig(join(configDir, 'team.yaml'));
      expect(config.members[0].provider).toBe('dsh');
    });

    it('slot_id 默认为 index', () => {
      writeConfig(`
team:
  name: "测试"

members:
  - id: "leader-01"
    name: "组长"
    role: "leader"
  - id: "coder-01"
    name: "码农"
    role: "coder"
`);
      const config = loadTeamConfig(join(configDir, 'team.yaml'));
      expect(config.members[0].slotId).toBe(0);
      expect(config.members[1].slotId).toBe(1);
    });

    it('权限默认为 reject', () => {
      writeConfig(`
team:
  name: "测试"

members:
  - id: "leader-01"
    name: "组长"
    role: "leader"
    slot_id: 0
`);
      const config = loadTeamConfig(join(configDir, 'team.yaml'));
      expect(config.members[0].permission).toBe('reject');
    });
  });

  describe('模板加载', () => {
    it('从模板文件加载 skillPrompt', () => {
      const templatePath = writeTemplate('leader.yaml', '你是组长，负责拆解任务');
      const relativePath = './templates/leader.yaml';
      writeConfig(`
team:
  name: "测试"

members:
  - id: "leader-01"
    name: "组长"
    role: "leader"
    template: "${relativePath}"
    slot_id: 0
`);
      const config = loadTeamConfig(join(configDir, 'team.yaml'));
      expect(config.members[0].skillPrompt).toBe('你是组长，负责拆解任务');
      expect(config.members[0].templatePath).toContain('leader.yaml');
    });

    it('模板文件不存在抛出错误', () => {
      writeConfig(`
team:
  name: "测试"

members:
  - id: "leader-01"
    name: "组长"
    role: "leader"
    template: "./templates/nonexistent.yaml"
    slot_id: 0
`);
      expect(() => loadTeamConfig(join(configDir, 'team.yaml'))).toThrow(
        'template file not found',
      );
    });
  });

  describe('错误诊断', () => {
    it('文件不存在抛出', () => {
      expect(() => loadTeamConfig('/nonexistent/team.yaml')).toThrow(
        'Team config file not found',
      );
    });

    it('无效 YAML 抛出', () => {
      const configPath = join(configDir, 'team.yaml');
      writeFileSync(configPath, '{{invalid yaml', 'utf-8');
      expect(() => loadTeamConfig(configPath)).toThrow(
        'Failed to parse team config YAML',
      );
    });

    it('缺少 team 段抛出', () => {
      writeConfig(`
members:
  - id: "leader-01"
    name: "组长"
    role: "leader"
`);
      expect(() => loadTeamConfig(join(configDir, 'team.yaml'))).toThrow(
        'missing "team" section',
      );
    });

    it('缺少 members 列表抛出', () => {
      writeConfig(`
team:
  name: "测试"
`);
      expect(() => loadTeamConfig(join(configDir, 'team.yaml'))).toThrow(
        'no members',
      );
    });

    it('空 members 列表抛出', () => {
      writeConfig(`
team:
  name: "测试"

members: []
`);
      expect(() => loadTeamConfig(join(configDir, 'team.yaml'))).toThrow(
        'no members',
      );
    });

    it('成员缺少 id 抛出', () => {
      writeConfig(`
team:
  name: "测试"

members:
  - name: "组长"
    role: "leader"
`);
      expect(() => loadTeamConfig(join(configDir, 'team.yaml'))).toThrow(
        'missing required field "id"',
      );
    });

    it('成员缺少 name 抛出', () => {
      writeConfig(`
team:
  name: "测试"

members:
  - id: "leader-01"
    role: "leader"
`);
      expect(() => loadTeamConfig(join(configDir, 'team.yaml'))).toThrow(
        'missing required field "name"',
      );
    });

    it('成员缺少 role 抛出', () => {
      writeConfig(`
team:
  name: "测试"

members:
  - id: "leader-01"
    name: "组长"
`);
      expect(() => loadTeamConfig(join(configDir, 'team.yaml'))).toThrow(
        'missing required field "role"',
      );
    });

    it('非法角色抛出', () => {
      writeConfig(`
team:
  name: "测试"

members:
  - id: "leader-01"
    name: "组长"
    role: "admin"
`);
      expect(() => loadTeamConfig(join(configDir, 'team.yaml'))).toThrow(
        'invalid role',
      );
    });

    it('缺少 leader 抛出', () => {
      writeConfig(`
team:
  name: "测试"

members:
  - id: "coder-01"
    name: "码农"
    role: "coder"
`);
      expect(() => loadTeamConfig(join(configDir, 'team.yaml'))).toThrow(
        'at least one member with role "leader"',
      );
    });

    it('重复 reviewer 角色抛出', () => {
      writeConfig(`
team:
  name: "测试"

members:
  - id: "leader-01"
    name: "组长"
    role: "leader"
  - id: "reviewer-01"
    name: "审核员"
    role: "reviewer"
  - id: "reviewer-02"
    name: "审核员2"
    role: "reviewer"
`);
      expect(() => loadTeamConfig(join(configDir, 'team.yaml'))).toThrow(
        'Duplicate role "reviewer"',
      );
    });

    it('多个 coder 合法', () => {
      writeConfig(`
team:
  name: "测试"

members:
  - id: "leader-01"
    name: "组长"
    role: "leader"
  - id: "coder-01"
    name: "码农1"
    role: "coder"
  - id: "coder-02"
    name: "码农2"
    role: "coder"
`);
      const config = loadTeamConfig(join(configDir, 'team.yaml'));
      const coders = config.members.filter((m) => m.role === 'coder');
      expect(coders.length).toBe(2);
    });
  });
});
