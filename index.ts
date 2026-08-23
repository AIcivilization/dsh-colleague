/**
 * Colleague Plugin — DSH (DeepSeek Harness) Cordis plugin entry
 *
 * Provides a multi-agent software delivery loop: Leader decomposes goals → Coder/Reviewer/Tester/Docs execute → quality gates.
 *
 * Install:
 *   dsh plugin --profile colleague-dev add ./dsh-colleague
 *
 * Usage:
 *   dsh --profile colleague-dev web
 *   → View the team panel inside DSH Web
 */

import type { Context } from '@deepseek-ai/cordis';
import { TeamRuntime } from './core/runtime/team-runtime';
import type { TeamConfig } from './core/runtime/types';
import { LeaderPlanner } from './core/planner/leader-planner';
import { OrchestrationLoop } from './core/orchestrator/orchestration-loop';
import { loadTeamConfig } from './core/config/loader';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

export interface ColleaguePluginConfig {
  /** Team config file path (default: config/team.yaml) */
  configPath?: string;
  /** Workspace root (default: DSH session workspace) */
  workspace?: string;
  /** Max concurrent write tasks (first version: 1, serial writes) */
  maxConcurrentWriters?: number;
  /** Enable memory injection */
  memoryEnabled?: boolean;
  /** Leader decision prompt file path (optional, default: loaded from template) */
  leaderPromptPath?: string;
}

export const name = 'dsh-colleague';
export const inject = [] as const;

import { fileURLToPath } from 'node:url';

/** Max request body size: 1MB to prevent abuse */
const MAX_BODY_SIZE = 1024 * 1024;

/** Read JSON from HTTP request body with size limit */
function readJsonBody(req: any): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    let tooLarge = false;
    req.on('data', (chunk: any) => {
      data += chunk;
      if (data.length > MAX_BODY_SIZE) {
        tooLarge = true;
        req.destroy();
      }
    });
    req.on('end', () => resolve(tooLarge ? '' : data));
    req.on('error', () => resolve(''));
  });
}

/** Check Origin/Host header to prevent CSRF (drive-by POST from browser) */
function isLocalOrigin(req: any): boolean {
  try {
    const origin = req.headers?.origin || req.headers?.host || '';
    if (!origin) return true; // Non-browser clients (curl, internal) have no Origin
    // Allow localhost and 127.0.0.1 on any port
    const allowed = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'];
    for (const a of allowed) {
      if (origin.startsWith(a) || origin.includes('//' + a)) return true;
    }
    return false;
  } catch {
    return true; // Fail open for non-browser requests
  }
}

export function apply(ctx: Context, config: ColleaguePluginConfig = {}) {
  // Plugin root directory — dist/index.js → ..
  const pluginDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

  // Load team config — resolved relative to plugin location by default
  let configPath = config.configPath;
  if (!configPath) {
    configPath = resolve(pluginDir, 'config/team.yaml');
  }
  const teamConfig = loadTeamConfig(configPath);

  // Create team runtime service — ensure workspace is an absolute path
  const workspaceRoot = resolve(config.workspace || process.cwd());
  const runtime = new TeamRuntime(ctx, {
    ...teamConfig,
    workspace: workspaceRoot,
    maxConcurrentWriters: config.maxConcurrentWriters ?? 1,
    memoryEnabled: config.memoryEnabled ?? true,
  });

  // Create Leader planner
  const planner = new LeaderPlanner(config.maxConcurrentWriters ?? 1);

  // Load Leader decision prompt
  let leaderDecisionPrompt = '';
  const promptPath = config.leaderPromptPath || resolve(pluginDir, 'templates/orchestrator.yaml');
  try {
    const templateContent = readFileSync(promptPath, 'utf-8');
    // Extract decision_prompt from YAML template (simple extraction, no full YAML parser)
    const match = templateContent.match(/decision_prompt:\s*\|\n([\s\S]*?)(\n[a-z_]+:|\n\.\.\.|$)/);
    if (match) {
      leaderDecisionPrompt = match[1];
    }
  } catch {
    // Template load failure does not block startup
  }

  // Create orchestration loop
  const loop = new OrchestrationLoop(runtime, planner, {
    maxIterations: 50,
    taskTimeoutMs: 300_000,
    leaderDecisionPrompt,
  });

  // Register as DSH services for other plugins and UI to access
  // Note: ctx.provide accepts values, not factory functions
  ctx.provide('colleague-team', runtime);
  ctx.provide('colleague-loop', loop);

  // Register team panel as DSH Web embedded panel
  // Frontend fetches team state via /plugins/dsh-colleague/state
  let routesRegistered = false;
  const registerWebPanel = () => {
    // Safely read ctx properties — bypass Cordis inject whitelist interception
    const safeGet = (name: string): any => {
      if (!ctx) return undefined;
      // Path 0: proxy backend object
      try {
        const raw: any = (ctx as any).internal ?? (ctx as any).raw ?? (ctx as any).root ?? undefined;
        if (raw && typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, name)) return raw[name];
        const svc: any = (ctx as any).service;
        if (svc && typeof svc === 'object' && Object.prototype.hasOwnProperty.call(svc, name)) return svc[name];
      } catch {}
      // Path 1: ctx.get(name, false)
      try {
        const c: any = ctx;
        if (typeof c.get === 'function') {
          const v = c.get(name, false);
          if (v !== undefined) return v;
        }
      } catch {}
      // Path 2: ctx.reflect.get(name, false)
      try {
        const ref: any = (ctx as any).reflect;
        if (ref && typeof ref.get === 'function') {
          const v = ref.get(name, false);
          if (v !== undefined) return v;
        }
      } catch {}
      // Path 3: runtime.services map
      try {
        const c: any = ctx;
        let rts: any = undefined;
        try { if (c.runtime) rts = c.runtime; } catch {}
        try { if (!rts && c.fiber?.runtime) rts = c.fiber.runtime; } catch {}
        if (rts && typeof rts === 'object') {
          let map: any = undefined;
          try { if (rts.services !== undefined) map = rts.services; } catch {}
          try { if (!map && rts._services !== undefined) map = rts._services; } catch {}
          if (map && typeof map === 'object' && Object.prototype.hasOwnProperty.call(map, name)) {
            const entry = map[name];
            if (entry?.value !== undefined) return entry.value;
            if (entry !== undefined) return entry;
          }
        }
      } catch {}
      // Path 4: direct read
      try {
        const v = (ctx as any)[name];
        if (v !== undefined) return v;
      } catch {}
      return undefined;
    };

    const webServer = safeGet('webServer');
    const settings = safeGet('settings');

    // Path 1: webServer.register — register HTTP API routes
    if (webServer && typeof webServer.register === 'function' && !routesRegistered) {
      const send = (res: any, status: number, body: any) => {
        try {
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(body));
        } catch {}
      };

      const routes = [
        {
          kind: 'exact' as const, method: 'GET', path: '/plugins/dsh-colleague/state',
          handler: (_req: any, res: any) => send(res, 200, runtime.getSnapshot()),
        },
        {
          kind: 'exact' as const, method: 'GET', path: '/plugins/dsh-colleague/events',
          handler: (req: any, res: any) => {
            const since = parseInt(new URL(req.url, 'http://localhost').searchParams.get('since') || '0', 10);
            send(res, 200, runtime.getEvents(since));
          },
        },
        {
          kind: 'exact' as const, method: 'POST', path: '/plugins/dsh-colleague/start',
          handler: async (req: any, res: any) => {
            // CSRF protection: check Origin for POST routes
            if (!isLocalOrigin(req)) {
              send(res, 403, { error: 'Forbidden: non-local origin' });
              return;
            }
            let body: any = {};
            try { body = JSON.parse(await readJsonBody(req)); } catch {}
            if (!body.goal || typeof body.goal !== 'string') {
              send(res, 400, { error: 'Missing "goal" field' });
              return;
            }
            if (loop.isRunning()) {
              send(res, 409, { error: 'Loop is already running', state: loop.getState() });
              return;
            }
            // Check valid start states (idle or failed)
            const currentState = loop.getState();
            if (currentState !== 'idle' && currentState !== 'failed') {
              send(res, 409, { error: `Cannot start loop in state: ${currentState}`, state: currentState });
              return;
            }
            // Start loop — errors propagate via events, not swallowed
            loop.start(body.goal).catch(() => {
              // Error is already handled inside loop.start (emits loop_failed)
            });
            send(res, 200, { ok: true, state: loop.getState() });
          },
        },
        {
          kind: 'exact' as const, method: 'POST', path: '/plugins/dsh-colleague/answer',
          handler: async (req: any, res: any) => {
            if (!isLocalOrigin(req)) {
              send(res, 403, { error: 'Forbidden: non-local origin' });
              return;
            }
            let body: any = {};
            try { body = JSON.parse(await readJsonBody(req)); } catch {}
            if (!body.answer || typeof body.answer !== 'string') {
              send(res, 400, { error: 'Missing "answer" field' });
              return;
            }
            loop.answerUser(body.answer);
            send(res, 200, { ok: true });
          },
        },
        {
          kind: 'exact' as const, method: 'POST', path: '/plugins/dsh-colleague/intervene',
          handler: async (req: any, res: any) => {
            if (!isLocalOrigin(req)) {
              send(res, 403, { error: 'Forbidden: non-local origin' });
              return;
            }
            let body: any = {};
            try { body = JSON.parse(await readJsonBody(req)); } catch {}
            const action = body.action as string | undefined;
            if (!action) {
              send(res, 400, { error: 'Missing "action" field' });
              return;
            }
            switch (action) {
              case 'pause':
                loop.pause();
                break;
              case 'resume':
                loop.resume();
                break;
              case 'skip':
                if (body.taskId) {
                  runtime.handleIntervention({ type: 'skip', taskId: body.taskId });
                } else {
                  send(res, 400, { error: 'Skip requires "taskId"' });
                  return;
                }
                break;
              case 'takeover':
                if (body.taskId) {
                  runtime.handleIntervention({ type: 'takeover', taskId: body.taskId });
                } else {
                  send(res, 400, { error: 'Takeover requires "taskId"' });
                  return;
                }
                break;
              case 'revise':
                if (body.message) {
                  runtime.handleIntervention({ type: 'revise', message: body.message });
                } else {
                  send(res, 400, { error: 'Revise requires "message"' });
                  return;
                }
                break;
              case 'answer':
                if (body.answer) {
                  loop.answerUser(body.answer);
                } else {
                  send(res, 400, { error: 'Answer requires "answer" field' });
                  return;
                }
                break;
              default:
                send(res, 400, { error: `Unknown action: ${action}` });
                return;
            }
            send(res, 200, { ok: true });
          },
        },
      ];

      let allRegistered = true;
      for (const r of routes) {
        try {
          webServer.register({ kind: r.kind, path: r.path, method: r.method, handler: r.handler });
        } catch {
          allRegistered = false;
        }
      }
      // Only set flag after all routes successfully registered
      if (allRegistered) {
        routesRegistered = true;
      }
    }

    // Path 2: settings.registerSection — register team panel card in DSH settings page
    // UI text is bilingual: auto-detected from system language
    if (settings && typeof settings.registerSection === 'function') {
      const isZh = typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('zh');
      try {
        settings.registerSection({
          id: 'colleague-team',
          title: isZh ? '团队面板' : 'Team Panel',
          description: isZh ? '多 Agent 协作团队状态与控制' : 'Multi-agent collaboration team status & control',
          icon: 'users',
          render: {
            async refresh() {
              const snapshot = runtime.getSnapshot();
              const members = (snapshot.members || []).map((m: any) => ({
                id: m.id,
                name: m.name,
                role: m.role,
                status: m.status,
                color: m.color || '#6b7280',
              }));
              const tasks = (snapshot.tasks || []).map((t: any) => ({
                id: t.id,
                title: t.title,
                assignee: t.assigneeId,
                status: t.status,
              }));
              return {
                sections: [
                  {
                    title: isZh ? '团队成员' : 'Team Members',
                    description: isZh ? '当前团队中的所有 AI 代理' : 'All AI agents in the current team',
                    columns: [
                      { key: 'name', label: isZh ? '名称' : 'Name' },
                      { key: 'role', label: isZh ? '角色' : 'Role' },
                      { key: 'status', label: isZh ? '状态' : 'Status' },
                    ],
                    rows: members,
                  },
                  {
                    title: isZh ? '任务看板' : 'Task Board',
                    description: isZh ? '当前正在执行和待执行的任务' : 'Currently executing and pending tasks',
                    columns: [
                      { key: 'title', label: isZh ? '任务' : 'Task' },
                      { key: 'assignee', label: isZh ? '负责人' : 'Assignee' },
                      { key: 'status', label: isZh ? '状态' : 'Status' },
                    ],
                    rows: tasks,
                  },
                ],
              };
            },
          },
          onAction: async (actionId: string, _payload: any) => {
            if (actionId === 'pause') loop.pause();
            if (actionId === 'resume') loop.resume();
            return { ok: true };
          },
        });
      } catch {}
    }
  };

  // Attempt registration immediately
  registerWebPanel();
  // Delayed retry (webServer/settings may activate after this plugin)
  {
    let retries = 0;
    const safeHas = (name: string): boolean => {
      // Use the same logic as safeGet to detect
      try {
        const raw: any = (ctx as any).internal ?? (ctx as any).raw ?? (ctx as any).root;
        if (raw?.[name]) return true;
      } catch {}
      try { if (typeof (ctx as any).get === 'function' && (ctx as any).get(name, false)) return true; } catch {}
      try { if ((ctx as any).reflect?.get?.(name, false)) return true; } catch {}
      try { if ((ctx as any)[name]) return true; } catch {}
      return false;
    };
    const tick = () => {
      if (retries++ > 40) return; // Max ~6 seconds
      if (!safeHas('webServer') || !safeHas('settings')) { setTimeout(tick, 150); return; }
      registerWebPanel();
    };
    setTimeout(tick, 150);
  }

  // Register subagent delegation — bind DSH SubagentRuntime to orchestration loop
  // Protected with try/catch: if dsh-subagent is unavailable, binding is deferred
  try {
    ctx.inject(['dsh-subagent'] as const, (ctx: Context) => {
      const subagentRuntime = (ctx as Context & { subagents: import('./core/orchestrator/orchestration-loop').SubagentRuntimeLike }).subagents;
      if (subagentRuntime) {
        loop.bindSubagentRuntime(subagentRuntime);
      }
    });
  } catch {
    // dsh-subagent service unavailable — subagent binding deferred until service is ready
  }

  // Clean up resources on plugin unload
  ctx.effect(() => {
    return () => {
      loop.dispose();
      runtime.dispose();
    };
  });
}

// Public API exports
export { TeamRuntime } from './core/runtime/team-runtime';
export { OrchestrationLoop } from './core/orchestrator/orchestration-loop';
export { LeaderPlanner } from './core/planner/leader-planner';
export type { TeamConfig, TeamState, TaskResult, QualityResult, TaskStatus, TeamEvent, MemberConfig, LeaderAction } from './core/runtime/types';
export type { OrchestrationLoopConfig, LoopState, LoopEvent } from './core/orchestrator/orchestration-loop';
export { loadTeamConfig } from './core/config/loader';
