# Colleague Plugin — Product Overview

> Persistent, role-based AI teams — a multi-agent collaboration plugin for DeepSeek Harness (DSH)
>
> Version 0.1.0 | MIT License

---

## 1. Product Overview

Colleague Plugin is a DSH (DeepSeek Harness) Cordis plugin that implements a controllable multi-agent software delivery loop.

User provides a goal → Leader decomposes into subtasks → Coder writes code → Reviewer reviews → Tester tests → Docs writes documentation → all pass, then report.

### Core Features

- Built on DSH native Subagent; no self-managed child processes
- Append-event + state projection model for team state management
- Leader output is schema-validated, not arbitrary JSON
- Quality gates: review rejections and test failures block final delivery
- Workspace serial write lock prevents concurrency conflicts
- Persisted event stream; state recoverable after restart
- Event-driven UI, no polling

---

## 2. System Architecture

```
┌──────────────────────────────────────────────────────┐
│                  DSH (DeepSeek Harness)               │
│                                                       │
│  ┌──────────────────────────────────────────────────┐ │
│  │           Colleague Plugin (Cordis)              │ │
│  │                                                  │ │
│  │  ┌─────────────┐  ┌──────────────┐             │ │
│  │  │ TeamRuntime │  │ MemoryService│             │ │
│  │  │ (state proj)│  │ (mem inject) │             │ │
│  │  └──────┬──────┘  └──────────────┘             │ │
│  │         │                                        │ │
│  │  ┌──────┴──────────────────────────┐            │ │
│  │  │     WorkspaceLock (serial write) │            │ │
│  │  └──────────────────────────────────┘            │ │
│  │                                                  │ │
│  │  ┌──────────────────────────────────┐            │ │
│  │  │     Web Panel (React embedded)    │            │ │
│  │  │     Event-driven, no polling       │            │ │
│  │  └──────────────────────────────────┘            │ │
│  └──────────────────────────────────────────────────┘ │
│                        │                              │
│           ┌────────────┼────────────┐                 │
│           ▼            ▼            ▼                 │
│    ctx.subagents (DSH native providers)               │
│    acp / codex / claude-code / dsh                     │
└──────────────────────────────────────────────────────┘
```

---

## 3. Team Roles

| Role | Responsibilities | State Machine |
|------|------------------|---------------|
| Leader | Decompose goals, assign tasks, orchestrate workflow | Bounded planner; output schema-validated |
| Coder | Write code, implement features, fix bugs | planned → ready → running → passed/failed |
| Reviewer | Code review, security audit | Result: approved / changes_requested |
| Tester | Write tests, execute tests | Result: test_passed / test_failed |
| Docs | Write technical docs, README | Only reads deliverables that passed quality gates |

---

## 4. Quality Gates

### Structured Result Protocol

All roles return a unified structured result:

```json
{
  "status": "completed | failed | blocked",
  "summary": "Task summary",
  "artifacts": ["path/to/file.ts"],
  "issues": [
    {
      "severity": "critical | warning | suggestion",
      "file": "path/to/file.ts",
      "line": 42,
      "description": "Issue description",
      "suggestion": "Fix suggestion"
    }
  ],
  "testCommand": "npm test",
  "testOutput": "...",
  "blockedReason": "Blocking reason"
}
```

### Gate Rules

- Reviewer's `changes_requested` blocks final delivery → auto-creates fix task
- Tester's `test_failed` blocks final delivery → auto-creates fix task
- Docs tasks only read deliverables that passed quality gates
- Code that hasn't passed review and testing cannot trigger `team completed`
- When an agent returns unstructured content, the task is not incorrectly marked as passed

---

## 5. Workspace & Concurrency Safety

- Workspace is provided by the parent DSH session
- Pre-checks before startup: directory exists, Git status readable
- Serial writes: coder vs coder, coder vs docs cannot write concurrently
- Deliverables attributed via Git diff before and after tasks
- Cancel, timeout, permission denial, and provider crashes must be cleaned up in the background
- No unauthenticated local HTTP control interface exposed

---

## 6. Memory System

First version implements persistent team events, architectural decisions, verified commands, and quality conclusions.

- Persistence path: `{workspace}/.colleague/memory/memory.jsonl`
- Retrieves and injects a small amount of relevant content per task into Leader or executing role
- Per-injection limit: 5 memories, 500 characters each, 2000 characters total
- After restart, architectural decisions and test conclusions from previous tasks are retrievable
- L0–L3 distillation deferred to later versions

---

## 7. User Intervention

| Action | Route | Effect |
|--------|-------|--------|
| Pause | teamId | Team pauses scheduling |
| Resume | teamId | Team continues scheduling |
| Revise | teamId + message | Leader receives revision instructions |
| Takeover | teamId | Leader pauses, waits for user |
| Skip | teamId + taskId | Cancel specified task |

All intervention operations wait for server confirmation before updating the UI.

---

## 8. Web Panel

### Three Views

| View | Layout |
|------|--------|
| Parallel | Grouped by member, horizontally arranged; each column shows that member's tasks and messages |
| Single | Only shows the selected member's activity stream |
| Board | Multi-column parallel display with filtering and sorting |

### Event-Driven

The panel subscribes to the event stream via `TeamRuntime.subscribe()`, replacing 500ms/1s polling.

### Component Inventory

| Component | Responsibility |
|-----------|---------------|
| TeamPage | Main page, assembles all components |
| TeamTabs | Member chip bar |
| AgentStatusBadge | Status badge |
| TeamViewToggle | View switcher |
| ActivityBoardLayout | Board layout |
| ActivityControlBar | Filtering and sorting |
| TaskCard | Task card |
| MessageCard | Message card |
| InterventionBar | Intervention control bar |
| TeamWarmupOverlay | Initialization overlay |

---

## 9. Configuration

### Team Config (`config/team.yaml`)

```yaml
team:
  name: "Frontend Team"

members:
  - id: "leader-01"
    role: "leader"
    provider: "dsh"
    model: "deepseek"
    template: "./templates/orchestrator.yaml"
    slot_id: 0
  # ...

workspace:
  path: "./workspace/"

concurrency:
  max_writers: 1

memory:
  enabled: true
  persistence: true
```

### Plugin Config (`cordis.yml`)

```yaml
- id: colleague-plugin
  name: 'colleague-plugin'
  config:
    configPath: 'config/team.yaml'
    maxConcurrentWriters: 1
    memoryEnabled: true
```

---

## 10. Tech Stack

| Layer | Technology |
|-------|-----------|
| Plugin framework | Cordis (DSH native) |
| Frontend framework | React 18 + TypeScript 5.8 |
| Build tool | tsdown |
| YAML parser | yaml |
| Testing | vitest |
| Communication | DSH Subagent (ctx.subagents) |

---

## 11. Known Limitations

- First version: each team binds to one DSH session and one workspace
- No multi-CLI mixed teams
- No L0–L3 memory distillation
- No multi-team collaboration
- No history replay
- No plugin marketplace publishing

---

## 12. Roadmap

### Completed (v0.1)

- [x] DSH Cordis plugin entry
- [x] TeamRuntime state machine (append-event + state projection)
- [x] Leader bounded planner (schema validation)
- [x] Quality gates (structured result protocol)
- [x] Workspace serial write lock
- [x] Event-driven UI
- [x] Event persistence and restart recovery
- [x] Memory service (persistence + injection limits)
- [x] Automated tests (unit, contract, integration, E2E)
- [x] dsh.bundle manifest and cordis.patch.yml
- [x] CHANGELOG and product documentation

### Planned

- [ ] Memory distillation pipeline (L0→L1→L2→L3)
- [ ] Multi-CLI mixed teams
- [ ] Team history replay
- [ ] Plugin marketplace publishing
