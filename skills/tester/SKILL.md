# Skill: Testing

> Core skill of the Tester — responsible for writing tests, executing tests, and validating results

## Capability Definition

```yaml
skill_id: testing
name: "Test Validation"
description: "Write test cases for features implemented by the Coder, execute tests, and validate correctness"
category: quality
complexity: medium
```

## Test Types

### 1. Unit Tests

Tests for individual functions/components:

```
- Happy path: input valid data -> verify correct output
- Error path: input invalid data -> verify error handling
- Boundary conditions: null, extreme values, edge cases
```

### 2. Integration Tests

Tests for multi-module collaboration:

```
- Data passing between modules is correct
- Interface calls match expectations
- Behavior after component composition is correct
```

### 3. Regression Tests

Ensure no new issues are introduced after bug fixes:

```
- Original bug is fixed
- Previously working functionality still works
- No new bugs introduced
```

## Workflow

```
Receive test task (from mailbox)
    |
    v
Read Coder's artifacts
    |
    v
Write test cases
    |
    +-- Unit tests
    +-- Integration tests
    +-- Boundary tests
    |
    v
Execute tests
    |
    +-- All pass -> notify Lead of pass
    |
    +-- Failures -> record failure details
    |              -> notify Lead to send back to Coder
    |
    v
Update blackboard with test results
    |
    v
Notify Lead via mailbox
```

## Test Case Standards

- Test file naming: `{source-file-name}.test.{ext}` (e.g., `Login.test.tsx`)
- Test descriptions should be clear: `should submit form with valid credentials`
- Each test should verify only one behavior
- Use the project's existing test framework (Jest/Vitest/Playwright)

## Prohibitions

- Do not fix code yourself (fixing is the Coder's job)
- Do not just test "it runs" — test "it's correct"
- Do not write tests without assertions
