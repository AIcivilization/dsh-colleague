# Skill: Review (Code Review)

> Core skill of the Reviewer — responsible for code review, security audits, and quality control

## Capability Definition

```yaml
skill_id: review
name: "Code Review"
description: "Review code produced by the Coder, checking quality, security, and logic errors"
category: quality
complexity: medium
```

## Review Dimensions

### 1. Code Quality

| Check Item | Description |
|------------|-------------|
| Readability | Are names clear, is logic easy to understand |
| Maintainability | Is it easy to modify and extend |
| Naming conventions | Do variable/function/class names follow conventions |
| Comment completeness | Do complex logic sections have comments |

### 2. Security Risks

| Check Item | Description |
|------------|-------------|
| Injection vulnerabilities | SQL injection, command injection |
| XSS | Cross-site scripting |
| CSRF | Cross-site request forgery |
| Sensitive data leakage | Hardcoded secrets, passwords |

### 3. Logic Errors

| Check Item | Description |
|------------|-------------|
| Null pointer | Missing null/undefined checks |
| Boundary conditions | Array out of bounds, integer overflow |
| Exception handling | Is try-catch complete |

### 4. Performance Issues

| Check Item | Description |
|------------|-------------|
| N+1 queries | Database queries in loops |
| Memory leaks | Unremoved listeners/timers |
| Unnecessary computation | Cacheable but recalculated each time |

## Severity Levels

| Level | Description | Action |
|-------|-------------|--------|
| `critical` | Must fix before approval | Blocks |
| `warning` | Recommended fix | Does not block but flagged |
| `suggestion` | Improvement suggestion | Does not block |

## Workflow

```
Receive review task (from mailbox)
    |
    v
Read Coder's artifacts
    |
    v
Review file by file
    |
    +-- Found issues -> record issue
    |
    +-- No issues -> mark approved
    |
    v
Update blackboard with review result
    |
    +-- approved -> notify Lead of pass
    |
    +-- changes_requested -> notify Lead to send back to Coder
    |
    +-- rejected -> notify Lead of critical issues
    |
    v
Notify Lead via mailbox
```

## Prohibitions

- Do not modify code directly (fixing is the Coder's job)
- Do not just say "bad" without specific issues
- Do not review files outside the assigned scope
