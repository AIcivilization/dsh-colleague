/**
 * Team config loader
 *
 * Loads team configuration from a YAML file, validates required fields,
 * loads role templates and skill prompts.
 * Missing files or invalid roles cause startup failure with diagnostics.
 *
 * Uses the `yaml` package for professional YAML parsing.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { parse as parseYAML } from 'yaml';
import type { TeamConfig, MemberConfig, RoleId } from '../runtime/types';

// ===== Constants =====

const VALID_ROLES: RoleId[] = ['leader', 'coder', 'reviewer', 'tester', 'docs'];

// ===== Config loading =====

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

  // Extract team info
  const team = raw.team as { name?: string; description?: string; id?: string } | undefined;
  if (!team) {
    throw new Error(
      `Team config missing "team" section in ${configPath}`,
    );
  }
  const teamName = team.name || 'Default Team';
  const teamId = team.id || `team-${teamName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  // Extract member list
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

  // Validate: must have a leader
  const hasLeader = members.some((m) => m.role === 'leader');
  if (!hasLeader) {
    throw new Error(
      `Team config must have at least one member with role "leader" in ${configPath}`,
    );
  }

  // Validate: no duplicate roles (except coder which can have multiple)
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

  // Extract concurrency config
  const concurrency = raw.concurrency as { max_writers?: number } | undefined;
  const maxWriters = concurrency?.max_writers ?? 1;

  // Extract memory config
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

  // provider is a registered DSH subagent provider name
  const provider = (raw.provider as string) || 'dsh';

  // model is an optional model identifier
  const model = raw.model as string | undefined;

  // template points to a role template file
  const templatePath = raw.template as string | undefined;
  let templatePathResolved: string | undefined;
  let skillPrompt: string | undefined;

  if (templatePath) {
    // Template path resolved relative to parent of config dir (project root)
    // config/team.yaml's ./templates/xxx.yaml → project-root/templates/xxx.yaml
    templatePathResolved = resolve(configDir, '..', templatePath);
    try {
      skillPrompt = readFileSync(templatePathResolved, 'utf-8');
    } catch {
      // If not found at parent level, try relative to config file itself
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

  // Permission mode defaults to reject (security first)
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

// ===== Skill prompt loading =====

export function loadSkillPrompt(path: string): string {
  try {
    return readFileSync(path, 'utf-8').trim();
  } catch {
    throw new Error(`Skill prompt file not found: ${path}`);
  }
}
