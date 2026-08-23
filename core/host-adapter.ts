/**
 * Host adapter — thin abstraction layer for DSH host interactions
 *
 * All host API access (webServer, subagents, settings) goes through this module.
 * When upstream DSH API changes, only this file needs updating.
 *
 * Design principle: upstream services are accessed via module augmentation
 * (direct property access on ctx), NOT via private structure probing.
 */

import type { Context } from '@deepseek-ai/cordis';
import type { SubagentRuntimeLike } from './orchestrator/orchestration-loop';

// ===== Types =====

/** Upstream WebRoute shape — no method field; method dispatch is in handler */
export interface WebRoute {
  kind: 'exact' | 'prefix';
  path: string;
  handler: (req: any, res: any) => void | Promise<void>;
}

// ===== WebServer =====

/**
 * Resolve webServer from context.
 * Upstream DSH augments ctx with webServer after module registration.
 */
export function resolveWebServer(ctx: Context): { register: (route: WebRoute) => void } | undefined {
  // Direct property access (upstream module augmentation)
  const ws = (ctx as any).webServer;
  if (ws && typeof ws.register === 'function') return ws;

  // Fallback: ctx.get(name, false)
  try {
    const c = ctx as any;
    if (typeof c.get === 'function') {
      const v = c.get('webServer', false);
      if (v && typeof v.register === 'function') return v;
    }
  } catch {}

  return undefined;
}

/** Register multiple routes on webServer. Returns true if all succeeded. */
export function registerRoutes(webServer: { register: (route: WebRoute) => void }, routes: WebRoute[]): boolean {
  let allOk = true;
  for (const r of routes) {
    try {
      webServer.register(r);
    } catch {
      allOk = false;
    }
  }
  return allOk;
}

// ===== Subagents =====

/**
 * Resolve subagent runtime from context.
 * Upstream DSH provides 'subagents' service via ctx.
 */
export function resolveSubagents(ctx: Context): SubagentRuntimeLike | undefined {
  // Direct property access
  const sa = (ctx as any).subagents;
  if (sa && typeof sa.start === 'function') return sa;

  // Fallback: ctx.get(name, false)
  try {
    const c = ctx as any;
    if (typeof c.get === 'function') {
      const v = c.get('subagents', false);
      if (v && typeof v.start === 'function') return v;
    }
  } catch {}

  return undefined;
}

// ===== Settings (legacy fallback) =====

/**
 * Resolve settings service from context.
 * NOTE: Upstream DSH settings is a config namespace system, not a UI card system.
 * This is kept as a best-effort fallback for backward compatibility.
 */
export function resolveSettings(ctx: Context): any | undefined {
  const settings = (ctx as any).settings;
  if (settings && typeof settings.registerSection === 'function') return settings;
  return undefined;
}

// ===== Has-service detection =====

/** Check if a service is available on context */
export function hasService(ctx: Context, name: string): boolean {
  // Direct property access
  if ((ctx as any)[name]) return true;
  // Fallback: ctx.get
  try {
    const c = ctx as any;
    if (typeof c.get === 'function' && c.get(name, false)) return true;
  } catch {}
  return false;
}
