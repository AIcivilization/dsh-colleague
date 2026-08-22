/**
 * 团队配置加载器
 *
 * 从 YAML 配置文件加载团队配置，验证必填字段，
 * 加载角色模板和技能 prompt。
 * 缺失文件、无效角色在启动时失败并给出诊断。
 *
 * 使用 yaml 包进行专业 YAML 解析，不依赖自写解析器。
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { parse as parseYAML } from 'yaml';
import type { TeamConfig, MemberConfig, RoleId } from '../runtime/types';

// ===== 常量 =====

const VALID_ROLES: RoleId[] = ['leader', 'coder', 'reviewer', 'tester', 'docs'];

// ===== 配置加载 =====

export function loadTeamConfig(configPath: string): Omit<TeamConfig, 'workspace' | 'maxConcurrentWriters' | 'memoryEnabled'> {
  const fullPath = resolve(configPath);
  let yamlText: string;
  try {
    yamlText = readFileSync(fullPath, 'utf-8');
  } catch (err) {
    throw new Error(
      `Team config file not found: ${fullPath}. ${(err as Error).message}`,
    );
  }

  let raw: Record<string, unknown>;
  try {
    raw = parseYAML(yamlText);
  } catch (err) {
    throw new Error(
      `Failed to parse team config YAML: ${fullPath}. ${(err as Error).message}`,
    );
  }

  if (!raw || typeof raw !== 'object') {
    throw new Error(`Team config is not a valid YAML object: ${configPath}`);
  }

  // 提取团队信息
  const team = raw.team as { name?: string; description?: string; id?: string } | undefined;
  if (!team) {
    throw new Error(
      `Team config missing "team" section in ${configPath}`,
    );
  }
  const teamName = team.name || '默认团队';
  const teamId = team.id || `team-${Date.now()}`;

  // 提取成员列表
  const membersRaw = raw.members as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(membersRaw) || membersRaw.length === 0) {
    throw new Error(
      `Team config has no members defined. At least one member is required in ${configPath}`,
    );
  }

  const configDir = dirname(fullPath);
  const members: MemberConfig[] = membersRaw.map((raw, index) => {
    return parseMember(raw, index, configDir, configPath);
  });

  // 验证：必须有一个 leader
  const hasLeader = members.some((m) => m.role === 'leader');
  if (!hasLeader) {
    throw new Error(
      `Team config must have at least one member with role "leader" in ${configPath}`,
    );
  }

  // 验证：角色不重复（除了可以有多个 coder）
  const roleCounts: Record<string, number> = {};
  for (const m of members) {
    roleCounts[m.role] = (roleCounts[m.role] || 0) + 1;
  }
  for (const role of ['reviewer', 'tester', 'docs'] as const) {
    if (roleCounts[role] > 1) {
      throw new Error(
        `Duplicate role "${role}" in team config. Only coder can have multiple members.`,
      );
    }
  }

  // 提取并发配置
  const concurrency = raw.concurrency as { max_writers?: number } | undefined;
  const maxWriters = concurrency?.max_writers ?? 1;

  // 提取记忆配置
  const memory = raw.memory as { enabled?: boolean; persistence?: boolean } | undefined;
  const memoryEnabled = memory?.enabled ?? true;

  return {
    teamId,
    teamName,
    members,
  };
}

function parseMember(
  raw: Record<string, unknown>,
  index: number,
  configDir: string,
  configPath: string,
): MemberConfig {
  const id = raw.id as string | undefined;
  if (!id) {
    throw new Error(
      `Member at index ${index} is missing required field "id" in ${configPath}`,
    );
  }

  const name = raw.name as string | undefined;
  if (!name) {
    throw new Error(
      `Member "${id}" is missing required field "name" in ${configPath}`,
    );
  }

  const roleStr = raw.role as string | undefined;
  if (!roleStr) {
    throw new Error(
      `Member "${id}" is missing required field "role" in ${configPath}`,
    );
  }
  if (!VALID_ROLES.includes(roleStr as RoleId)) {
    throw new Error(
      `Member "${id}" has invalid role "${roleStr}". Must be one of: ${VALID_ROLES.join(', ')} in ${configPath}`,
    );
  }
  const role = roleStr as RoleId;

  // provider 是 DSH 已注册的 subagent provider 名称
  const provider = (raw.provider as string) || 'dsh';

  // model 是可选的模型标识
  const model = raw.model as string | undefined;

  // template 指向角色模板文件
  const templatePath = raw.template as string | undefined;
  let templatePathResolved: string | undefined;
  let skillPrompt: string | undefined;

  if (templatePath) {
    // 模板路径相对于配置文件的父目录（项目根）解析
    // config/team.yaml 中的 ./templates/xxx.yaml → 项目根/templates/xxx.yaml
    templatePathResolved = resolve(configDir, '..', templatePath);
    try {
      skillPrompt = readFileSync(templatePathResolved, 'utf-8');
    } catch {
      // 如果上一级目录没找到，尝试相对于配置文件本身
      try {
        templatePathResolved = resolve(configDir, templatePath);
        skillPrompt = readFileSync(templatePathResolved, 'utf-8');
      } catch {
        throw new Error(
          `Member "${id}": template file not found: ${templatePath} (resolved: ${resolve(configDir, '..', templatePath)})`,
        );
      }
    }
  }

  const slotId = (raw.slot_id as number) ?? index;

  // 权限模式默认为 reject（安全第一）
  const permission = (raw.permission as 'reject' | 'allow' | 'ask') || 'reject';

  return {
    id,
    name,
    role,
    provider,
    model,
    permission,
    skillPrompt: skillPrompt,
    templatePath: templatePathResolved,
    slotId,
  };
}

// ===== 技能 prompt 加载 =====

export function loadSkillPrompt(path: string): string {
  try {
    return readFileSync(path, 'utf-8').trim();
  } catch {
    throw new Error(`Skill prompt file not found: ${path}`);
  }
}
