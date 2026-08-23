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
import { resolveWebServer, registerRoutes, resolveSettings, hasService } from './core/host-adapter';
import type { WebRoute } from './core/host-adapter';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

// ===== HTTP helpers =====

/** Max request body size: 1MB to prevent abuse */
const MAX_BODY_SIZE = 1024 * 1024;

/** Read JSON from HTTP request body with size limit */
function readJsonBody(req: any): Promise<{ ok: boolean; data: string }> {
  return new Promise((resolveFn) => {
    let data = '';
    let tooLarge = false;
    let resolved = false;
    const done = () => {
      if (resolved) return;
      resolved = true;
      resolveFn({ ok: !tooLarge, data: tooLarge ? '' : data });
    };
    req.on('data', (chunk: any) => {
      if (tooLarge) return;
      data += chunk;
      if (data.length > MAX_BODY_SIZE) {
        tooLarge = true;
        // Resolve immediately — don't wait for 'end'/'error'
        done();
        try { req.destroy(); } catch {}
        return;
      }
    });
    req.on('end', done);
    req.on('error', done);
  });
}

/** Check Origin/Host header to prevent CSRF (drive-by POST from browser) */
function isLocalOrigin(req: any): boolean {
  try {
    const origin = req.headers?.origin;
    if (!origin) {
      // No Origin header — non-browser client (curl, internal), allow
      const host = req.headers?.host;
      if (!host) return true;
      return isLocalHost(host);
    }
    // Parse origin as URL and check hostname
    try {
      const url = new URL(origin);
      return isLocalHostname(url.hostname);
    } catch {
      // Not a valid URL — reject
      return false;
    }
  } catch {
    return true; // Fail open for edge cases
  }
}

function isLocalHost(host: string): boolean {
  // Strip port
  const hostname = host.split(':')[0];
  return isLocalHostname(hostname);
}

function isLocalHostname(hostname: string): boolean {
  const allowed = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1'];
  return allowed.includes(hostname);
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
  ctx.provide('colleague-team', runtime);
  ctx.provide('colleague-loop', loop);

  // ===== Route registration =====
  // WebRoute shape: { kind, path, handler } — no method field
  // GET/POST dispatch is done inside each handler

  let routesRegistered = false;

  const send = (res: any, status: number, body: any) => {
    try {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    } catch {}
  };

  const requirePost = (req: any, res: any): boolean => {
    if (req.method !== 'POST') {
      send(res, 405, { error: 'Method not allowed' });
      return false;
    }
    return true;
  };

  const routes: WebRoute[] = [
    {
      kind: 'exact', path: '/plugins/dsh-colleague/state',
      handler: (req: any, res: any) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          send(res, 405, { error: 'Method not allowed' });
          return;
        }
        send(res, 200, runtime.getSnapshot());
      },
    },
    {
      kind: 'exact', path: '/plugins/dsh-colleague/events',
      handler: (req: any, res: any) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          send(res, 405, { error: 'Method not allowed' });
          return;
        }
        const since = parseInt(new URL(req.url, 'http://localhost').searchParams.get('since') || '0', 10);
        send(res, 200, runtime.getEvents(since));
      },
    },
    {
      kind: 'exact', path: '/plugins/dsh-colleague/start',
      handler: async (req: any, res: any) => {
        if (!requirePost(req, res)) return;
        if (!isLocalOrigin(req)) {
          send(res, 403, { error: 'Forbidden: non-local origin' });
          return;
        }
        const { ok: bodyOk, data } = await readJsonBody(req);
        if (!bodyOk) {
          send(res, 413, { error: 'Payload too large' });
          return;
        }
        let body: any = {};
        try { body = JSON.parse(data); } catch {}
        if (!body.goal || typeof body.goal !== 'string') {
          send(res, 400, { error: 'Missing "goal" field' });
          return;
        }
        // TOCTOU-safe: check state + set inFlight atomically
        const currentState = loop.getState();
        if (currentState !== 'idle' && currentState !== 'failed') {
          send(res, 409, { error: `Cannot start loop in state: ${currentState}`, state: currentState });
          return;
        }
        if (loop.isStartInFlight()) {
          send(res, 409, { error: 'Loop start already in flight' });
          return;
        }
        loop.setStartInFlight(true);
        // Start loop — errors propagate via events
        loop.start(body.goal).catch(() => {
          // Error already handled inside loop.start (emits loop_failed)
        }).finally(() => {
          loop.setStartInFlight(false);
        });
        send(res, 200, { ok: true, state: loop.getState() });
      },
    },
    {
      kind: 'exact', path: '/plugins/dsh-colleague/answer',
      handler: async (req: any, res: any) => {
        if (!requirePost(req, res)) return;
        if (!isLocalOrigin(req)) {
          send(res, 403, { error: 'Forbidden: non-local origin' });
          return;
        }
        const { ok: bodyOk, data } = await readJsonBody(req);
        if (!bodyOk) {
          send(res, 413, { error: 'Payload too large' });
          return;
        }
        let body: any = {};
        try { body = JSON.parse(data); } catch {}
        if (!body.answer || typeof body.answer !== 'string') {
          send(res, 400, { error: 'Missing "answer" field' });
          return;
        }
        try {
          loop.answerUser(body.answer);
          send(res, 200, { ok: true });
        } catch (err: any) {
          send(res, 500, { error: err?.message || 'Internal error' });
        }
      },
    },
    {
      kind: 'exact', path: '/plugins/dsh-colleague/intervene',
      handler: async (req: any, res: any) => {
        if (!requirePost(req, res)) return;
        if (!isLocalOrigin(req)) {
          send(res, 403, { error: 'Forbidden: non-local origin' });
          return;
        }
        const { ok: bodyOk, data } = await readJsonBody(req);
        if (!bodyOk) {
          send(res, 413, { error: 'Payload too large' });
          return;
        }
        let body: any = {};
        try { body = JSON.parse(data); } catch {}
        const action = body.action as string | undefined;
        if (!action) {
          send(res, 400, { error: 'Missing "action" field' });
          return;
        }
        try {
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
                // Also inject into loop's current goal for leader to see next iteration
                loop.injectGoalSuffix('\n\nUser revision: ' + body.message);
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
        } catch (err: any) {
          send(res, 500, { error: err?.message || 'Internal error' });
        }
      },
    },
  ];

  const registerWebPanel = () => {
    const webServer = resolveWebServer(ctx);
    if (webServer && !routesRegistered) {
      if (registerRoutes(webServer, routes)) {
        routesRegistered = true;
      }
    }

    // Legacy settings fallback (best-effort, may not exist in real DSH)
    const settings = resolveSettings(ctx);
    if (settings && !routesRegistered) {
      // If webServer isn't available, register a basic settings panel as fallback
      try {
        settings.registerSection({
          id: 'colleague-team',
          title: 'Team Panel',
          description: 'Multi-agent collaboration team status & control',
          icon: 'users',
          render: {
            async refresh() {
              const snapshot = runtime.getSnapshot();
              return {
                sections: [{
                  title: 'Team Status',
                  columns: [
                    { key: 'name', label: 'Name' },
                    { key: 'role', label: 'Role' },
                    { key: 'status', label: 'Status' },
                  ],
                  rows: (snapshot.members || []).map((m: any) => ({
                    id: m.id, name: m.name, role: m.role, status: m.status,
                  })),
                }],
              };
            },
          },
          onAction: async (actionId: string) => {
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
  // Delayed retry (webServer may activate after this plugin)
  {
    let retries = 0;
    const tick = () => {
      if (routesRegistered || retries++ > 40) return;
      if (!hasService(ctx, 'webServer')) { setTimeout(tick, 150); return; }
      registerWebPanel();
    };
    setTimeout(tick, 150);
  }

  // Register subagent delegation — bind DSH SubagentRuntime to orchestration loop
  try {
    ctx.inject(['dsh-subagent'] as const, (ctx: Context) => {
      // Use host-adapter to resolve subagents
      const sa = (ctx as any).subagents;
      if (sa && typeof sa.start === 'function') {
        loop.bindSubagentRuntime(sa);
      }
    });
  } catch {
    // dsh-subagent service unavailable — subagent binding deferred
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
export type { WebRoute } from './core/host-adapter';
