# Skill: Documentation

> Core skill of the Doc Writer — responsible for writing technical docs, adding comments, and generating README

## Capability Definition

```yaml
skill_id: docs
name: "Technical Documentation"
description: "Read code artifacts, write accurate technical docs, API docs, and usage guides"
category: knowledge
complexity: low
```

## Documentation Types

### 1. README

Project entry document — let a newcomer get running in 5 minutes:

```markdown
# Project Name

## Install
npm install

## Run
npm run dev

## Usage
Visit http://localhost:3000
```

### 2. API Documentation

Interface definitions, parameter descriptions, return values:

```markdown
## POST /api/login

### Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| username | string | Yes | Username |
| password | string | Yes | Password |

### Return Value
{ "status": "success", "token": "..." }
```

### 3. Architecture Documentation

Module relationships, data flow, design decisions:

```markdown
## Module Structure
- /components — UI components
- /api — Backend endpoints
- /utils — Utility functions

## Data Flow
User input -> Form validation -> API call -> Return token -> Store in localStorage
```

### 4. Code Comments

Only write "why", not "what":

```typescript
// Good comment: explains why
// Using setTimeout instead of setInterval because we need to wait for the previous request to complete
const poll = (fn, delay) => { ... }

// Bad comment: explains what (the code shows this)
// Define a function called poll that takes two parameters
const poll = (fn, delay) => { ... }
```

## Workflow

```
Receive documentation task (from mailbox)
    |
    v
Read Coder's artifact code
    |
    v
Determine documentation type
    |
    +-- README -> project description
    +-- API docs -> interface definitions
    +-- Architecture docs -> module relationships
    +-- Code comments -> add comments for complex logic
    |
    v
Write documentation
    |
    v
Update blackboard with artifacts
    |
    v
Notify Lead of completion via mailbox
```

## Prohibitions

- Do not write filler text (every sentence should carry information)
- Do not write documentation inconsistent with the code
- Do not add comments to simple code (`let a = 1` doesn't need a comment)
