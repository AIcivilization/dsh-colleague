# CHANGELOG

## v0.1.0 (2026-08-21)

### Breaking Changes

This version refactors dsh-colleague from a standalone Express + Vite prototype into a **DeepSeek Harness (DSH) Cordis plugin**. The following are incompatible changes:

#### Removed Features

- **Standalone Express API server**: Deleted `server/` directory and all HTTP endpoints (`/api/*`, CORS, Vite proxy). `npm run server` is no longer needed.
- **Custom ACP client**: Removed `ACPSessionManager`, PATH scanning, and custom JSON-RPC lifecycle. Now uses DSH native `ctx.subagents`.
- **CLI scan discovery**: Removed the frontend CLI scan interface. "Available Agent" is now defined as "providers configured in the current DSH profile."
- **Standalone Vite dev server**: Removed `npm run dev`. The panel is embedded in the DSH Web host.
- **L0–L3 memory distillation**: Deferred to future versions. First version implements persistent retrieval injection of team events, architectural decisions, verified commands, and quality conclusions.

#### New Architecture

- **Cordis plugin entry**: `index.ts` exports `apply(ctx)`, registered as DSH service `colleague-team`.
- **Append-event + state projection**: `TeamRuntime` manages team state. All mutations go through `appendEvent`; state is derived from event projection.
- **Leader planner**: Leader output is schema-validated (7 action types). Invalid output retries up to 2 times.
- **Quality gates**: Unified structured result protocol. `changes_requested` and `test_failed` block final delivery.
- **Workspace serial write lock**: Coder and Coder, Coder and Docs cannot write concurrently.
- **Event-driven UI**: Removed 500ms polling. Real-time response to backend events via `subscribe`.
- **Event persistence**: Event stream written to `events.jsonl`. Full team state can be restored after restart.
- **Memory service**: Persisted to `memory.jsonl`, retrieved and injected per task, with count and character limits.

### Migration Steps

1. **Install DSH**: Ensure DeepSeek Harness (`dsh`) is installed.
2. **Install plugin**:
   ```bash
   dsh plugin --profile colleague-dev add ./dsh-colleague
   ```
3. **Configure team**: Edit `config/team.yaml` to specify members, roles, and providers.
4. **Launch panel**:
   ```bash
   dsh --profile colleague-dev web
   ```
   View the team panel within DSH Web.

### Rollback Steps

1. **Uninstall plugin**:
   ```bash
   dsh plugin --profile colleague-dev remove dsh-colleague
   ```
2. **Restore previous version**: `git checkout` to the commit before the refactor.
3. **Clean persisted data**: Remove the `.colleague/` directory from the workspace.
   ```bash
   rm -rf .colleague/
   ```

### Known Limitations

- First version: each team binds to one DSH session and one workspace.
- At most one code write task in the same workspace at any time (serial writes).
- No multi-CLI mixed teams.
- No L0–L3 memory distillation.
- No multi-team collaboration.
