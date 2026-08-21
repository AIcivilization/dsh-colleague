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
import { LeaderPlanner } from './core/planner/leader-planner';
import { OrchestrationLoop } from './core/orchestrator/orchestration-loop';
import { loadTeamConfig } from './core/config/loader';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface ColleaguePluginConfig {
  /** 团队配置文件路径（默认 config/team.yaml） */
  configPath?: string;
  /** 工作区根目录（默认使用 DSH session 工作区） */
  workspace?: string;
  /** 最大并发写任务数（首版固定为 1，串行写入） */
  maxConcurrentWriters?: number;
  /** 是否启用记忆注入 */
  memoryEnabled?: boolean;
  /** Leader 的 decision prompt 文件路径（可选，默认从模板加载） */
  leaderPromptPath?: string;
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

  // 创建 Leader 计划器
  const planner = new LeaderPlanner(config.maxConcurrentWriters ?? 1);

  // 加载 Leader decision prompt
  let leaderDecisionPrompt = '';
  const promptPath = config.leaderPromptPath || resolve(process.cwd(), 'templates/orchestrator.yaml');
  try {
    const templateContent = readFileSync(promptPath, 'utf-8');
    // 从 YAML 模板中提取 decision_prompt（简单提取，不引入完整 YAML 解析器）
    const match = templateContent.match(/decision_prompt:\s*\|\n([\s\S]*?)(\n[a-z_]+:|\n\.\.\.|$)/);
    if (match) {
      leaderDecisionPrompt = match[1];
    }
  } catch {
    // 模板加载失败不阻塞启动
  }

  // 创建编排循环
  const loop = new OrchestrationLoop(runtime, planner, {
    maxIterations: 50,
    taskTimeoutMs: 300_000,
    leaderDecisionPrompt,
  });

  // 注册为 DSH 服务，供其他插件和 UI 访问
  // 注意：ctx.provide 接收值，不接收工厂函数
  ctx.provide('colleague-team', runtime);
  ctx.provide('colleague-loop', loop);

  // 注册团队面板为 DSH Web 嵌入面板
  ctx.inject(['dsh-web'] as const, (ctx: Context) => {
    // DSH Web 面板注册 — 通过动态导入加载 React 组件
    // 面板组件通过 web/main.tsx 导出 registerPanel 函数
    try {
      // 动态导入面板模块
      import('./web/main').then(({ registerPanel }) => {
        // 获取 DSH Web 提供的挂载点
        const dshWeb = (ctx as Context & { 'dsh-web'?: { mountPanel?: (id: string, factory: (mount: HTMLElement) => () => void) => void } })['dsh-web'];
        if (dshWeb && typeof dshWeb.mountPanel === 'function') {
          dshWeb.mountPanel('colleague-team', (mount: HTMLElement) => {
            return registerPanel(mount, {
              getSnapshot: () => runtime.getSnapshot(),
              subscribe: (listener) => runtime.subscribe(listener),
              getEvents: (since) => runtime.getEvents(since),
              handleIntervention: (cmd) => loop.pause(), // 面板介入直接暂停循环
            });
          });
        }
      }).catch(() => {
        // 面板加载失败不阻塞核心功能
      });
    } catch {
      // 面板注册失败不阻塞核心功能
    }
  });

  // 注册 Subagent 委托 — 绑定 DSH SubagentRuntime 到编排循环
  ctx.inject(['dsh-subagent'] as const, (ctx: Context) => {
    // 从 ctx 获取 DSH SubagentRuntime 实例
    const subagentRuntime = (ctx as Context & { subagents: import('./core/orchestrator/orchestration-loop').SubagentRuntimeLike }).subagents;
    if (subagentRuntime) {
      loop.bindSubagentRuntime(subagentRuntime);
    }
  });

  // 插件卸载时清理资源
  ctx.effect(() => {
    return () => {
      loop.dispose();
      runtime.dispose();
    };
  });
}

// 导出公共 API
export { TeamRuntime } from './core/runtime/team-runtime';
export { OrchestrationLoop } from './core/orchestrator/orchestration-loop';
export { LeaderPlanner } from './core/planner/leader-planner';
export type { TeamConfig, TeamState, TaskResult, QualityResult, TaskStatus, TeamEvent, MemberConfig, LeaderAction } from './core/runtime/types';
export type { OrchestrationLoopConfig, LoopState, LoopEvent } from './core/orchestrator/orchestration-loop';
export { loadTeamConfig } from './core/config/loader';
