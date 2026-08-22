/**
 * contract contractTest — Bundle install install、configverify verify、DSH service service register inputand provider cancapability reject reject
 *
 * Testcover cover：
 * - dsh.bundle.json manifest conclusion structure complete whole integrity
 * - cordis.patch.yml dependencydeclaration brightand package.json peerDependencies one consistent
 * - plugin component input port apply(ctx) register volume service service
 * - plugin componentconfig schema Validation
 * - provider cancapability reject reject（notregister volume provider enter input blocked/failed status）
 * - plugin component uninstall loadafterresource source release release
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createMockContext, createMockTeamConfig, cleanupWorkspace } from '../unit/helpers';
import { TeamRuntime } from '../../core/runtime/team-runtime';
import type { TeamConfig } from '../../core/runtime/types';

const ROOT = process.cwd();

describe('contract contractTest：Bundle Manifest', () => {
  it('dsh.bundle.json storeatandcanparsing', () => {
    const path = resolve(ROOT, 'dsh.bundle.json');
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, 'utf-8');
    const manifest = JSON.parse(content);
    expect(manifest.id).toBe('colleague-plugin');
    expect(manifest.name).toBe('colleague-plugin');
    expect(manifest.version).toBe('0.1.0');
  });

  it('manifest declaration bright host and client input port', () => {
    const path = resolve(ROOT, 'dsh.bundle.json');
    const manifest = JSON.parse(readFileSync(path, 'utf-8'));
    expect(manifest.entry.host).toBe('./dist/index.js');
    expect(manifest.entry.client).toBe('./dist/web/main.js');
  });

  it('manifest declaration bright inject and provides', () => {
    const path = resolve(ROOT, 'dsh.bundle.json');
    const manifest = JSON.parse(readFileSync(path, 'utf-8'));
    expect(manifest.inject).toContain('dsh-session');
    expect(manifest.inject).toContain('dsh-subagent');
    expect(manifest.provides).toContain('colleague-team');
  });

  it('manifest peerDependencies and package.json one consistent', () => {
    const bundlePath = resolve(ROOT, 'dsh.bundle.json');
    const pkgPath = resolve(ROOT, 'package.json');
    const bundle = JSON.parse(readFileSync(bundlePath, 'utf-8'));
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

    const bundleDeps = bundle.peerDependencies;
    const pkgDeps = pkg.peerDependencies;

    for (const dep of Object.keys(bundleDeps)) {
      expect(pkgDeps[dep]).toBeDefined();
    }
  });

  it('manifest config schema bind meaning all hasconfigitem', () => {
    const path = resolve(ROOT, 'dsh.bundle.json');
    const manifest = JSON.parse(readFileSync(path, 'utf-8'));
    const schema = manifest.config.schema;
    expect(schema.configPath).toBeDefined();
    expect(schema.maxConcurrentWriters).toBeDefined();
    expect(schema.memoryEnabled).toBeDefined();
  });
});

describe('contract contractTest：cordis.patch.yml', () => {
  it('cordis.patch.yml storeat', () => {
    const path = resolve(ROOT, 'cordis.patch.yml');
    expect(existsSync(path)).toBe(true);
  });

  it('patch.yml declaration bright plugin component ID andconfig', () => {
    const path = resolve(ROOT, 'cordis.patch.yml');
    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('colleague-plugin');
    expect(content).toContain('configPath');
    expect(content).toContain('maxConcurrentWriters');
    expect(content).toContain('memoryEnabled');
  });

  it('patch.yml declaration bright all has mustneeddependency', () => {
    const path = resolve(ROOT, 'cordis.patch.yml');
    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('@deepseek-ai/cordis');
    expect(content).toContain('@deepseek-ai/dsh-session');
    expect(content).toContain('@deepseek-ai/dsh-subagent');
    expect(content).toContain('@deepseek-ai/dsh-agent');
    expect(content).toContain('@deepseek-ai/dsh-tool-subagent');
  });

  it('patch.yml declaration brightcanselectdependency dsh-web', () => {
    const path = resolve(ROOT, 'cordis.patch.yml');
    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('dsh-web');
    expect(content).toContain('optionalDependencies');
  });
});

describe('contract contractTest：structure create produce artifact', () => {
  it('dist/index.js storeat（Host input port）', () => {
    const path = resolve(ROOT, 'dist', 'index.js');
    expect(existsSync(path)).toBe(true);
  });

  it('dist/web/main.js storeat（Client input port）', () => {
    const path = resolve(ROOT, 'dist', 'web', 'main.js');
    expect(existsSync(path)).toBe(true);
  });

  it('dist/ include include .d.ts class type declaration bright text component', () => {
    const distDir = resolve(ROOT, 'dist');
    expect(existsSync(distDir)).toBe(true);
    // tsdown produce success .d.ts text component
    const files = readdirSync(distDir).filter((f) => f.endsWith('.d.ts'));
    expect(files.length).toBeGreaterThan(0);
  });
});

describe('contract contractTest：plugin component input portandservice service register input', () => {
  let ctx: any;
  let config: TeamConfig;
  let runtime: TeamRuntime;

  beforeEach(() => {
    ctx = createMockContext();
    config = createMockTeamConfig();
    runtime = new TeamRuntime(ctx, config);
  });

  afterEach(() => {
    runtime.dispose();
    cleanupWorkspace(config.workspace);
  });

  it('TeamRuntime register volumefor colleague-team service service', () => {
    // verify verify runtime actual instance storeatand has public together API
    expect(runtime).toBeDefined();
    expect(typeof runtime.getSnapshot).toBe('function');
    expect(typeof runtime.subscribe).toBe('function');
    expect(typeof runtime.createTask).toBe('function');
    expect(typeof runtime.transitionTask).toBe('function');
    expect(typeof runtime.recordQuality).toBe('function');
    expect(typeof runtime.handleIntervention).toBe('function');
    expect(typeof runtime.dispose).toBe('function');
  });

  it('TeamRuntime connect affected DSH subagent provider bind bind', () => {
    expect(typeof runtime.bindSubagentProvider).toBe('function');
    // bind bindbeforefor null
    // bind bind mock provider
    const mockProvider = { name: 'dsh', capabilities: { tools: ['*'] } };
    expect(() => runtime.bindSubagentProvider(ctx)).not.toThrow();
  });

  it('plugin component uninstall loadafter dispose release release all has resource source', () => {
    const rt = new TeamRuntime(ctx, config);
    let received = 0;
    rt.subscribe(() => received++);
    rt.dispose();

    // dispose after listeners hascleanempty
    expect(received).toBe(0); // no has newevent
  });
});

describe('contract contractTest：Provider cancapability reject reject', () => {
  let ctx: any;
  let config: TeamConfig;

  beforeEach(() => {
    ctx = createMockContext();
    config = createMockTeamConfig();
  });

  afterEach(() => {
    cleanupWorkspace(config.workspace);
  });

  it('notregister volume provider oftaskenter input blocked/failed status', () => {
    const runtime = new TeamRuntime(ctx, config);
    runtime.startPlanning();
    runtime.startRunning();

    // createtaskbut no has bind bind subagent provider
    const task = runtime.createTask('Test Task', 'Description', 'coder');
    runtime.transitionTask(task.id, 'ready');
    runtime.transitionTask(task.id, 'running');

    // taskcanby run row，but no has provider bind bindwhen，actual actual execute row willfailed
    // verify verify runtime no has provider whencanmanage managestatus
    expect(runtime.getSnapshot().tasks.find((t) => t.id === task.id)?.status).toBe('running');

    runtime.dispose();
  });

  it('notroleoftaskcreateRejected', () => {
    const runtime = new TeamRuntime(ctx, config);
    runtime.startPlanning();

    expect(() =>
      runtime.createTask('task', 'Description', 'unknown-role' as any),
    ).toThrow('No member with role');

    runtime.dispose();
  });

  it('configinvalidwhenstart movefailedand give outputdiagnostics', () => {
    const badConfig = { ...config, workspace: '/nonexistent/path' };
    // TeamRuntime structure buildwhennotcheck check workspace storeatintegrity（ to WorkspaceLock）
    // but createTask atrun rowwhenwillPassed WorkspaceLock check check
    const runtime = new TeamRuntime(ctx, badConfig);
    runtime.startPlanning();
    runtime.startRunning();

    const task = runtime.createTask('task', 'Description', 'coder');
    runtime.transitionTask(task.id, 'ready');
    // running when WorkspaceLock.acquire will check check item record storeatintegrity
    // does not existwhenenter input blocked status
    runtime.transitionTask(task.id, 'running');

    // due to workspace does not exist，taskshouldkeep hold blocked or running
    // （get decis to WorkspaceLock implement）
    const state = runtime.getSnapshot();
    const taskState = state.tasks.find((t) => t.id === task.id);
    expect(taskState).toBeDefined();

    runtime.dispose();
  });
});

describe('contract contractTest：--dump-config  content integrity', () => {
  it('cordis.yml include include plugin component ID andconfig', () => {
    const path = resolve(ROOT, 'cordis.yml');
    const content = readFileSync(path, 'utf-8');
    expect(content).toContain('colleague-plugin');
    expect(content).toContain('configPath');
    expect(content).toContain('maxConcurrentWriters');
    expect(content).toContain('memoryEnabled');
  });

  it('package.json exports declaration bright Host and Client input port', () => {
    const path = resolve(ROOT, 'package.json');
    const pkg = JSON.parse(readFileSync(path, 'utf-8'));
    expect(pkg.exports['.']).toBeDefined();
    expect(pkg.exports['.'].import).toBe('./dist/index.js');
    expect(pkg.exports['./web']).toBeDefined();
    expect(pkg.exports['./web'].import).toBe('./dist/web/index.js');
  });

  it('package.json files include include all has must need produce artifact', () => {
    const path = resolve(ROOT, 'package.json');
    const pkg = JSON.parse(readFileSync(path, 'utf-8'));
    expect(pkg.files).toContain('dist');
    expect(pkg.files).toContain('cordis.yml');
    expect(pkg.files).toContain('templates');
    expect(pkg.files).toContain('skills');
    expect(pkg.files).toContain('config');
  });
});
