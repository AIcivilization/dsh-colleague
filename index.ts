/**
 * Colleague Plugin — DSH (DeepSeek Harness) Cordis 插件入口
 *
 * 提供多 Agent 软件交付闭环：Leader 拆解目标 → Coder/Reviewer/Tester/Docs 执行 → 质量门禁。
 *
 * 安装方式：
 *   dsh plugin --profile colleague-dev add ./colleague-plugin
 *
 * 使用方式：
 *   dsh --profile colleague-dev web
 *   → 在 DSH Web 内看到团队面板
 */

import type { Context } from '@deepseek-ai/cordis';
import { TeamRuntime } from './core/runtime/team-runtime';
import type { TeamConfig } from './core/runtime/types';
import { loadTeamConfig } from './core/config/loader';

export interface ColleaguePluginConfig {
  /** 团队配置文件路径（默认 config/team.yaml） */
  configPath?: string;
  /** 工作区根目录（默认使用 DSH session 工作区） */
  workspace?: string;
  /** 最大并发写任务数（首版固定为 1，串行写入） */
  maxConcurrentWriters?: number;
  /** 是否启用记忆注入 */
  memoryEnabled?: boolean;
}

export const name = 'colleague-plugin';
export const inject = ['dsh-session', 'dsh-subagent'] as const;

export function apply(ctx: Context, config: ColleaguePluginConfig = {}) {
  // 加载团队配置
  const teamConfig = loadTeamConfig(config.configPath || 'config/team.yaml');

  // 创建团队运行时服务
  const runtime = new TeamRuntime(ctx, {
    ...teamConfig,
    workspace: config.workspace || process.cwd(),
    maxConcurrentWriters: config.maxConcurrentWriters ?? 1,
    memoryEnabled: config.memoryEnabled ?? true,
  });

  // 注册为 DSH 服务，供其他插件和 UI 访问
  ctx.provide('colleague-team', () => runtime);

  // 注册团队面板为 DSH Web 嵌入面板
  ctx.inject(['dsh-web'] as const, (ctx: Context) => {
    // DSH Web 面板注册 — 面板组件通过 web/main.tsx 导出
    // 面板注册的具体 API 由 DSH Web 插件提供
  });

  // 注册 Subagent 委托工具 — 让 Leader 能通过 DSH 原生 subagent 派发任务
  ctx.inject(['dsh-subagent', 'dsh-tool-subagent'] as const, (ctx: Context) => {
    // 团队运行时使用 DSH 原生 subagent 进行任务委托
    runtime.bindSubagentProvider(ctx);
  });

  // 插件卸载时清理资源
  ctx.effect(() => {
    return () => runtime.dispose();
  });
}

// 导出公共 API
export { TeamRuntime } from './core/runtime/team-runtime';
export type { TeamConfig, TeamState, TaskResult, QualityResult, TaskStatus, TeamEvent, MemberConfig, LeaderAction } from './core/runtime/types';
export { loadTeamConfig } from './core/config/loader';
