# dsh-colleague Refinement Plan

## Goals & Default Decisions

Refactor the project from a standalone Express + Vite prototype into an installable, runnable DeepSeek Harness (DSH) plugin. The first releasable version only promises a "controllable multi-agent software delivery loop"; it does not promise L0–L3 automatic memory distillation, mixed-CLI teams, or multi-team collaboration.

Default constraints:

- Use DSH's Cordis bundle, `ctx.subagents`, session and task lifecycle; remove the custom ACP client, CLI shell fallback, and standalone Express API.
- First version: each team binds to one DSH session and one workspace; at most one code write task in the same workspace at any time.
- Deny high-risk permissions by default; users must confirm through DSH's existing permission mechanism.
- "Long-term memory" first version implements persistent team events, task results, and retrieval injection; L0–L3 distillation deferred to later versions.
- All DSH dependencies pinned to a verified version, with contract tests to prevent pre-release upgrade breakage.

## Implementation Items & Acceptance Criteria

### 1. Establish an Installable DSH Bundle

Change the entry to a Cordis plugin providing `apply(ctx)`; complete `dsh.bundle` manifest, `cordis.patch.yml`, build artifacts, and peer dependencies. Host side registers the team runtime service; Client side registers the DSH-embedded team panel.

Remove standalone ports, CORS, `/api/*`, Vite proxy, and `execSync` CLI fallback. Retain existing UI components, only migrating their data sources.

Acceptance criteria:

- `dsh plugin --profile colleague-dev add ./dsh-colleague` succeeds.
- `dsh --profile colleague-dev --dump-config` shows the plugin layer and all dependency lines.
- After launching DSH Web, the plugin panel is visible in the host; no `npm run server` or `npm run dev` needed.
- After uninstalling the plugin, team service, event listeners, and background tasks are all released.

### 2. Replace Custom ACP Layer with DSH Native Subagent

Delete `ACPSessionManager`, PATH scanning, and custom JSON-RPC lifecycle. Use `ctx.subagents` with registered `acp`, `codex`, or `claude-code` providers; role config can only select registered providers whose capabilities meet requirements.

"Available Agent" is redefined as "providers configured in the current profile," not "binaries present in PATH." Retain provider name, model, permission mode, and capability summary for UI display.

Acceptance criteria:

- No direct `spawn()`, `execSync()`, or manual ACP JSON-RPC.
- When a provider is unregistered, lacks requested capabilities, or fails to start, the task enters a clear `blocked` or `failed` state with reason displayed.
- Complete a minimal coder task with a real DSH provider; no residual child processes after execution.
- Discovery/selection UI does not show CLIs not verified by DSH providers.

### 3. Rebuild Team Runtime & State Model

Add a `TeamRuntime` service using "append-event + state projection" to manage team, members, tasks, deliverables, quality conclusions, and user instructions. Tasks and events use stable UUIDs; titles are no longer used as dependency identifiers.

Define fixed states:

- Team: `idle → planning → running → paused → completed | failed | cancelled`
- Task: `planned → ready → running → blocked | passed | failed | cancelled`
- Quality: `pending → approved | changes_requested | test_passed | test_failed`

All state transitions go through a single reducer for validation; unknown tasks, illegal transitions, duplicate completions, and stale events must be rejected with audit events recorded.

Acceptance criteria:

- Pause, resume, revise, takeover, skip all route by real `teamId` and `taskId`; no more `leader`/`leader-01` inconsistency.
- After refreshing Web or reloading the plugin, team state, tasks, messages, and events are recoverable.
- Unit tests cover legal transitions, illegal transitions, duplicate events, canceling running tasks, and failure recovery.
- Each task can be traced from UI back to input, executor, result, deliverables, test results, and final conclusion.

### 4. Constrain Leader as a Bounded Planner

Leader does not output arbitrary JSON directly; only schema-validated actions are allowed: `create_task`, `unblock_task`, `request_review`, `request_test`, `request_docs`, `report`, `ask_user`.

Planner output must validate roles, dependencies, task count, concurrency budget, and resource budget. Invalid output retries up to twice automatically; if still failing, team is set to `blocked` and user intervention is required. Initial plan must not dispatch tasks with dependency relationships simultaneously.

Acceptance criteria:

- Non-JSON, missing fields, unknown roles, circular dependencies, and exceeded concurrency do not start subtasks.
- Review change requests automatically create fix tasks; fixes must be re-reviewed.
- Test failures automatically create fix tasks; fixes must be re-tested.
- Documentation tasks and final reports are only allowed after all tasks pass.
- Empty plans, all-failed plans, and partially canceled plans produce clear terminal reports instead of silent endings.

### 5. Establish Real Role Results & Quality Gates

Define a unified structured result protocol for coder, reviewer, tester, and docs. Results include: status, summary, output files, issue list, test commands, test results, and blocking reasons.

"Subprocess exited successfully" no longer counts as task completion. Reviewer's `changes_requested` and Tester's `failed` must block final delivery; Docs tasks only read deliverables that passed quality gates.

Acceptance criteria:

- Simulate the full loop: coder succeeds → reviewer rejects → coder fixes → reviewer approves → tester fails → coder fixes → tester passes.
- Each quality conclusion displays specific issues, files, line numbers, and suggestions in the UI.
- Code that hasn't passed review and testing cannot trigger `team completed`.
- When an agent returns unstructured content, the task is not incorrectly marked as passed.

### 6. Workspace, Concurrency & Permission Security

The workspace is provided by the parent DSH session; pre-checks run before startup: directory exists, Git status is readable, write scope is clear, and current change baseline is recorded.

First version uses serial writes: coder vs coder, coder vs docs cannot write concurrently; review/test only reads concurrently after dependencies complete. Deliverables are attributed via Git diff before and after tasks, not relying on ACP tool call events.

Cancel, timeout, permission denial, and provider crashes must be cleaned up in the background, marking tasks as `blocked` or `failed`. No unauthenticated local HTTP control interface is exposed.

Acceptance criteria:

- When two write tasks are ready simultaneously, the second stays `blocked` until the first releases the workspace lock.
- Each completed task's output files are consistent with Git diff.
- No orphan tasks or child processes after timeout, cancel, or provider crash.
- Under default permission policy, high-risk operations cannot execute without user confirmation.

### 7. Fix & Migrate Team Panel

The panel subscribes to `TeamRuntime`'s real event stream, replacing 500ms/1s dual polling. Tasks, messages, stream output, errors, and member status all come from the same event projection.

Pause, resume, revise, takeover, skip must wait for server confirmation before updating UI; skip requires the user to select a specific task. Member rename, add, delete are controlled team config operations; front-end array-only modifications are not allowed.

Parallel, single-chat, and board views must display different information; streaming output needs truncation, expansion, and error states.

Acceptance criteria:

- Normal task dispatch and completion messages appear on the board, not just broadcast messages.
- After clicking pause, no new tasks are dispatched; after resume, scheduling continues.
- Clicking skip accurately cancels the selected task without affecting others.
- Network or runtime errors are visible in the UI, not silently swallowed.
- The three views have observable different layouts and interaction behaviors.

### 8. Make Config, Templates, Skills & Memory Actually Work

Replace the currently unparsed YAML with the DSH plugin config schema. Team config must actually determine members, roles, providers, models, concurrency, budget, permissions, workspace, and memory toggle.

Role templates and skill files are loaded as actual prompt/skill resources; missing files, unknown model families, or invalid roles fail at plugin startup with diagnostics.

First version memory implements persistent team events, architectural decisions, verified commands, and quality conclusions; retrieves and injects a small amount of relevant content per task into the Leader or executing role. Remove the "four-level memory implemented" product description.

Acceptance criteria:

- After modifying team config, the members, providers, and concurrency strategy of created teams change accordingly.
- When a template is missing or config is invalid, startup fails with error pinpointing the field or file.
- After restart, architectural decisions and test conclusions from previous tasks are retrievable.
- Memory content injected per task has count and character limits to prevent unbounded growth.

### 9. Add Automated Tests & Release Gates

Add unit, contract, integration, and end-to-end tests:

- Unit: state machine, message routing, dependency DAG, result validation, lock and cancel.
- Contract: bundle installation, `--dump-config`, DSH service injection, and provider capability rejection.
- Integration: mock provider, real DSH provider minimal task, event persistence and recovery.
- End-to-end: normal delivery, review rejection, test failure, pause/resume, takeover, skip, timeout, plugin reload.

Build scripts must check Host, Client, and config; add `test`, `test:integration`, `test:e2e`, `check`. `check` is the sole gate before merge and release.

Acceptance criteria:

- `npm run check` covers server, client, config, and types; no Host code is skipped.
- All P0/P1 flows have automated regression test cases.
- Real provider E2E uses an isolated test repository; after execution, diff, test results, and process cleanup are verified.
- A compatibility matrix is generated before release: DSH version, Node version, provider, platform, and results.

### 10. Update Product Docs & Release Notes

Rewrite README, PRODUCT, ARCHITECTURE, and config examples to clarify installation, permission model, workspace rules, cost/concurrency budget, supported providers, and known limitations.

Remove old design system references, "v1.0 completed," and unimplemented memory/streaming/config descriptions. Reframe visual design as a custom design system.

Acceptance criteria:

- New users can install, configure, launch a test team, and run an example goal using only the README.
- Feature list is consistent with automated test coverage; no unimplemented capabilities are claimed.
- CHANGELOG includes breaking migrations, old standalone service removal, and rollback steps.

## Delivery Order

1. Bundle & native DSH integration.
2. TeamRuntime, state machine, intervention commands & persistence.
3. Planner, role results, quality gates & workspace lock.
4. UI migration.
5. Config, memory, tests & docs.

Only after the first four items pass acceptance do we proceed to real project workspace testing; memory enhancement, multi-CLI mixed teams, history replay, and plugin marketplace publishing come after the first stable version.
