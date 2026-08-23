# Architecture Design Document

## 1. Overall Architecture

### 1.1 Layered Architecture

```
┌──────────────────────────────────────────────────────────┐
│  User Interaction Layer (Web UI)                          │
│  ┌──────────────────────────────────────────────────┐     │
│  │ Team Panel (dsh-colleague custom design)          │     │
│  │  - Top member bar + status indicators           │     │
│  │  - Activity board (TaskCard + MessageCard)      │     │
│  │  - Control bar (filter/sort)                    │     │
│  │  - View toggle (parallel/single/board)          │     │
│  │  - Warmup initialization overlay                │     │
│  │  - Intervention bar (pause/revise/takeover/skip)│     │
│  └──────────────────────────────────────────────────┘     │
├──────────────────────────────────────────────────────────┤
│  Team Runtime Layer (TeamRuntime)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Leader    │  │ Event    │  │ State    │              │
│  │ (planner) │  │ Project  │  │ Machine │              │
│  │           │  │ (reducer)│  │ (transit)│              │
│  └──────────┘  └──────────┘  └──────────┘              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Quality  │  │Workspace │  │ Memory   │              │
│  │ Gates    │  │ Lock     │  │ Service  │              │
│  └──────────┘  └──────────┘  └──────────┘              │
├──────────────────────────────────────────────────────────┤
│  DSH Subagent Adapter Layer                              │
│  ┌──────────────────────────────────────────────────┐     │
│  │ ctx.subagents — DSH native provider management   │     │
│  │ acp / codex / claude-code / dsh                  │     │
│  └──────────────────────────────────────────────────┘     │
├──────────────────────────────────────────────────────────┤
│  DSH Infrastructure                                      │
│  Cordis bundle | Session mgmt | Task lifecycle | Perms  │
└──────────────────────────────────────────────────────────┘
```

### 1.2 Core Design Decisions

1. **DSH Native Subagent**: Each colleague uses registered DSH providers via `ctx.subagents`; no self-managed child processes.
2. **Append-event + State Projection**: All state changes go through `appendEvent`; state is derived from event projection (reducer). Tasks and events use stable UUIDs.
3. **Leader Bounded Planner**: Leader output is schema-validated (7 action types); invalid output retries up to 2 times.
4. **Quality Gates**: Unified structured result protocol; `changes_requested` and `test_failed` block final delivery.
5. **Workspace Serial Write Lock**: coder vs coder, coder vs docs cannot write concurrently; review/test only reads concurrently after dependencies complete.
6. **Event-Driven UI**: Polling removed; real-time response to backend event stream via `subscribe`.
7. **Event Persistence**: Event stream written to `events.jsonl`; full team state recoverable after restart.

## 2. Team Configuration Format

### 2.1 team.yaml

```yaml
# config/team.yaml — Team configuration file
teamId: "frontend-team"
teamName: "Frontend Team"
workspace: "/path/to/workspace"
maxConcurrentWriters: 1
memoryEnabled: true

members:
  - id: "leader-01"
    name: "Lead"
    role: "leader"
    provider: "dsh"
    model: "deepseek-v3"
    slotId: 0

  - id: "coder-01"
    name: "Coder"
    role: "coder"
    provider: "dsh"
    model: "deepseek-v3"
    slotId: 1

  - id: "reviewer-01"
    name: "Reviewer"
    role: "reviewer"
    provider: "dsh"
    model: "deepseek-v3"
    slotId: 2

  - id: "tester-01"
    name: "Tester"
    role: "tester"
    provider: "dsh"
    model: "deepseek-v3"
    slotId: 3

  - id: "docs-01"
    name: "Doc Writer"
    role: "docs"
    provider: "dsh"
    model: "deepseek-v3"
    slotId: 4
```

### 2.2 Role Definitions

| Role | Responsibilities | Available Actions |
|------|------------------|-------------------|
| `leader` | Decompose tasks, assign, orchestrate decisions | `create_task`, `unblock_task`, `request_review`, `request_test`, `request_docs`, `report`, `ask_user` |
| `coder` | Write code, fix bugs | Receives `create_task` |
| `reviewer` | Code review, suggest changes | Receives `request_review` |
| `tester` | Write tests, execute tests | Receives `request_test` |
| `docs` | Write documentation | Receives `request_docs` |

## 3. State Model

### 3.1 Team State

```
idle → planning → running → paused → running (resumed)
                         → completed (done)
                         → failed (failure)
                         → cancelled (cancelled)
```

### 3.2 Task State

```
planned → ready → running → passed (passed)
                          → failed (failed) → ready (fix retry)
                          → blocked (blocked) → ready (unblocked)
                          → cancelled (cancelled)
        → cancelled (direct cancel)

passed → failed (review rejection)
```

### 3.3 Quality State

```
pending → approved (review passed)
        → changes_requested (changes requested)
        → test_passed (test passed)
        → test_failed (test failed)
```

## 4. Orchestration Loop (OrchestrationLoop)

### 4.0 Recovery Note

The orchestration loop is the plugin's "heart" — it chains the Leader planner, TeamRuntime state machine, quality gates, and workspace lock into an automated closed loop.

The original architecture document (commit `1243a53`) contained `leaderDecisionLoop` pseudocode design, but was deleted along with the old blackboard/mailbox concepts in commit `82472b3` ("clear old architecture residue"). After that, the plugin had all the parts but no engine.

The current implementation (`core/orchestrator/orchestration-loop.ts`) is based on the original pseudocode design but rewritten to use DSH's native `SubagentRuntime` API.

### 4.1 Loop Flow

```
User goal
    │
    ▼
┌──────────────────────────────────────────────────┐
│  OrchestrationLoop                                │
│                                                   │
│  while (status !== completed/failed/cancelled): │
│    1. Build Leader prompt (team state + goal + memory)│
│    2. ctx.subagents.start() → Leader output       │
│    3. LeaderPlanner.parseLeaderOutput() → action  │
│    4. Execute action:                              │
│       create_task → TeamRuntime.createTask()       │
│         → ctx.subagents.start(coder) → result     │
│         → TeamRuntime.transitionTask(passed)       │
│       request_review → ctx.subagents.start(reviewer)│
│         → TeamRuntime.recordQuality(approved/changes)│
│       request_test → ctx.subagents.start(tester)   │
│         → TeamRuntime.recordQuality(passed/failed) │
│       request_docs → ctx.subagents.start(docs)     │
│         → TeamRuntime.transitionTask(passed)       │
│       unblock_task → TeamRuntime.transitionTask(ready)│
│       report → TeamRuntime.complete() → exit loop │
│       ask_user → pause, wait for answerUser()     │
│    5. Loop back to step 1                          │
└──────────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────────┐
│  TeamRuntime (passive state machine)              │
│  - State management, event projection, persistence│
│  - Quality gates, workspace lock                   │
│  - Memory service                                  │
└──────────────────────────────────────────────────┘
```

### 4.2 Orchestration Loop API

```typescript
class OrchestrationLoop {
  // Bind DSH SubagentRuntime (bound in index.ts during ctx.inject)
  bindSubagentRuntime(rt: SubagentRuntimeLike): void;

  // Start loop (receive user goal)
  async start(goal: string): Promise<void>;

  // Pause/resume/cancel
  pause(): void;
  resume(): void;
  cancel(): void;

  // Answer Leader's question (called after ask_user)
  answerUser(response: string): void;

  // Subscribe to loop events
  subscribe(listener: (event: LoopEvent) => void): () => void;
}
```

### 4.3 Event Types

| Event | Trigger |
|------|---------|
| `loop_started` | Loop starts |
| `leader_called` | Before calling Leader subagent |
| `leader_output_received` | After Leader returns output |
| `leader_action_validated` | LeaderPlanner validation passed |
| `task_dispatched` | Task dispatched to subagent |
| `task_completed` | Subagent returns result |
| `task_failed` | Subagent execution failed |
| `quality_recorded` | Review or test conclusion recorded |
| `user_question` | Leader asks user a question |
| `loop_paused` | Loop paused |
| `loop_resumed` | Loop resumed |
| `loop_completed` | Loop completed |
| `loop_failed` | Loop failed |
| `loop_cancelled` | Loop cancelled |

### 4.4 Plugin Entry Integration

```typescript
// index.ts
export function apply(ctx: Context, config: DshColleagueConfig) {
  const runtime = new TeamRuntime(ctx, teamConfig);
  const planner = new LeaderPlanner(config.maxConcurrentWriters);
  const loop = new OrchestrationLoop(runtime, planner);

  // Register as DSH services (note: pass value, not factory function)
  ctx.provide('colleague-team', runtime);
  ctx.provide('colleague-loop', loop);

  // Bind SubagentRuntime
  ctx.inject(['dsh-subagent'], (ctx) => {
    loop.bindSubagentRuntime(ctx.subagents);
  });

  // Register Web panel
  ctx.inject(['dsh-web'], (ctx) => {
    import('./web/main').then(({ registerPanel }) => {
      ctx['dsh-web'].mountPanel('colleague-team', (mount) => {
        return registerPanel(mount, runtime);
      });
    });
  });

  ctx.effect(() => () => { loop.dispose(); runtime.dispose(); });
}
```

## 5. Leader Planner

### 5.1 Leader Action Schema

Leader only allows the following 7 actions:

| Action | Purpose | Required Fields |
|--------|---------|-----------------|
| `create_task` | Create subtask | `title`, `description`, `role`, `dependencies` |
| `unblock_task` | Unblock a task | `taskId` |
| `request_review` | Request review | `taskId` |
| `request_test` | Request testing | `taskId` |
| `request_docs` | Request documentation | `taskId` |
| `report` | Report completion | `summary` |
| `ask_user` | Ask user a question | `question` |

### 5.2 Validation Rules

- `reason` field must be non-empty
- `role` must be a defined role
- Task IDs in `dependencies` must exist
- Circular dependencies are rejected
- Concurrency budget must not exceed configured limit
- Initial plan must not dispatch tasks with dependency relationships simultaneously

### 5.3 Retry Mechanism

Invalid output retries up to 2 times automatically; if still failing, team is set to `blocked` and user intervention is required.

## 6. Quality Gates

### 6.1 Structured Result Protocol

```typescript
interface TaskResult {
  status: 'completed' | 'failed';
  summary: string;
  artifacts: string[];
  issues: Issue[];
}

interface QualityResult {
  status: 'approved' | 'changes_requested' | 'test_passed' | 'test_failed';
  summary: string;
  issues: Issue[];
  testCommand?: string;
  testOutput?: string;
}
```

### 6.2 Quality Gate Rules

- `changes_requested` → Task status becomes `failed`; fix required, then re-review
- `test_failed` → Task status becomes `failed`; fix required, then re-test
- `approved` + `test_passed` → Task status becomes `passed`
- Code that hasn't passed review and testing cannot trigger `team completed`
- Documentation tasks only read deliverables that passed quality gates

## 7. Workspace & Concurrency Safety

### 7.1 Serial Write Lock

- coder vs coder, coder vs docs cannot write concurrently
- review/test only reads concurrently after dependencies complete
- Deliverables attributed via Git diff before and after tasks

### 7.2 Pre-checks

- Directory exists
- Git status is readable
- Write scope is clear
- Current change baseline is recorded

### 7.3 Exception Handling

- Cancel, timeout, permission denial, and provider crashes → background cleanup, task marked `blocked` or `failed`
- No unauthenticated local HTTP control interface exposed

## 8. Event Persistence & Recovery

### 8.1 Event Stream

All state changes are appended to `events.jsonl`, one JSON event per line. Event types include:

- `team_created` / `team_status_changed`
- `member_added` / `member_removed`
- `task_created` / `task_status_changed` / `task_completed` / `task_failed`
- `quality_recorded` / `artifact_added`
- `message_sent` / `user_intervention` / `error`

### 8.2 Recovery Flow

1. Read `events.jsonl`
2. Verify team ID matches
3. Replay all events in order
4. Project current state through reducer

## 9. Memory System

### 9.1 Memory Types

First version persists the following:

- Team events (`team_status_changed`, etc.)
- Architectural decisions (decision records in `team_status_changed`)
- Verified commands
- Quality conclusions (`quality_recorded`)

### 9.2 Retrieval & Injection

- Retrieve relevant memories by task ID
- Inject into Leader or executing role's prompt
- Count limit (default 5 entries) and character limit (default 4000 characters) to prevent unbounded growth
