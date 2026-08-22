# Skill: Orchestration

> Core skill of the Lead — responsible for task decomposition, assignment, and flow decisions

## Capability Definition

```yaml
skill_id: orchestration
name: "Orchestration"
description: "Understand user goals, decompose into subtasks, assign to team members, and dynamically decide workflow"
category: management
complexity: high
```

## Core Capabilities

### 1. Task Decomposition

Decompose the user's high-level goal into executable subtasks:

```
User: "Build a login page"
    |
    v
Leader decomposes:
  +-- [Coder] Implement login page UI component
  +-- [Coder] Implement login API endpoint
  +-- [Reviewer] Review login module code
  +-- [Tester] Write login feature tests
  +-- [Doc Writer] Write login module documentation
```

Decomposition principles:
- Each subtask should be independently completable by one colleague
- Subtasks can have dependencies but no circular dependencies
- Subtask granularity should not be too fine ("write a function" is too fine) or too coarse ("implement the entire system" is too coarse)

### 2. Task Assignment

Assign tasks based on colleague skill matching:

| Subtask Type | Assigned To |
|-------------|-------------|
| Write code / fix bugs | Coder |
| Code review | Reviewer |
| Write/run tests | Tester |
| Write documentation | Doc Writer |

### 3. Flow Decision

The Leader looks at the blackboard state and **makes dynamic decisions** (not following a fixed pipeline):

```
Sees: Coder completed Login.tsx
Decision: Have Reviewer review
    |
Sees: Reviewer says "null pointer risk"
Decision: Send back to Coder for fix
    |
Sees: Coder fixed it
Decision: Have Reviewer re-review
    |
Sees: Review passed
Decision: Have Tester test
    |
Sees: All tests passed
Decision: Have Doc Writer write docs
    |
Sees: Docs complete
Decision: Report to user, all done
```

## Decision Examples

### Scenario 1: Normal Flow

```json
// Blackboard state
{
  "tasks": [
    { "id": "t1", "title": "Implement login UI", "assignee": "Coder", "status": "completed" },
    { "id": "t2", "title": "Review login module", "assignee": "Reviewer", "status": "pending" }
  ],
  "member_states": {
    "Coder": { "status": "idle" },
    "Reviewer": { "status": "idle" }
  }
}

// Leader decision
{
  "action": "assign",
  "task": { "id": "t2", "title": "Review login module", "assignee": "Reviewer" },
  "reason": "Coder completed login UI, next step is Reviewer review"
}
```

### Scenario 2: Review Rejection

```json
// Blackboard state
{
  "tasks": [
    { "id": "t2", "title": "Review login module", "assignee": "Reviewer", "status": "completed", "result": "changes_requested: null pointer risk" }
  ],
  "member_states": {
    "Coder": { "status": "idle" }
  }
}

// Leader decision
{
  "action": "assign",
  "task": { "id": "t3", "title": "Fix null pointer risk", "assignee": "Coder", "description": "Reviewer found null pointer risk at line 42 of Login.tsx, add null check" },
  "reason": "Review found issues, send back to Coder for fix"
}
```

### Scenario 3: User Intervention

```json
// User says: "Skip testing"
// Leader decision
{
  "action": "revise",
  "reason": "User requested to skip testing, cancel test-related tasks",
  "revised_plan": "Coder completes -> Review passes -> Docs directly -> Report complete"
}
```
