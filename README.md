# dsh-colleague

> Persistent, role-based AI teams — a multi-agent collaboration plugin for DeepSeek Harness (DSH)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

dsh-colleague is a [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) Cordis plugin that lets multiple AI agents work together like real colleagues:

- **Leader decomposes goals** → Coder writes code → Reviewer reviews → Tester validates → Docs writes documentation
- Fully automated workflow with real-time human intervention (pause, revise, takeover, skip)
- Built on DSH's native Subagent architecture — no manual subprocess management

## Quick Start

### Prerequisites

- Node.js `>= 22.19.0`
- DSH installed (`dsh --version` >= 0.1.0-rc.8)
- At least one subagent provider registered in DSH
- Git installed and available in PATH
- Supported OS: **macOS**, **Linux**, **Windows** (PowerShell or cmd)

### One-Click Install

#### macOS / Linux

```bash
# Clone the repo
git clone https://github.com/AIcivilization/dsh-colleague.git
cd dsh-colleague

# One-click install: build + register with DSH + restart + verify
bash scripts/install-to-dsh-web.sh
```

#### Windows (PowerShell)

```powershell
# Clone the repo
git clone https://github.com/AIcivilization/dsh-colleague.git
cd dsh-colleague

# One-click install: build + register with DSH + restart + verify
powershell -ExecutionPolicy Bypass -File scripts\install-to-dsh-web.ps1
```

The script automatically:
1. Builds `dist/`
2. Installs to the web profile via `dsh plugin --profile web add file://`
3. Restarts DSH web
4. Verifies the plugin is mounted and API routes are accessible

After installation, open http://127.0.0.1:3080 and navigate to **Settings → Plugins** to see `dsh-colleague`.

### Manual Install

```bash
# Build
npm install
npm run build

# Install to DSH
dsh plugin --profile web add file:///path/to/dsh-colleague

# Restart DSH
dsh web
```

## Team Roles

| Role | Skill | Responsibilities | Template |
|------|-------|-----------------|----------|
| Leader | orchestration | Decompose goals, assign tasks, orchestrate workflow | `templates/orchestrator.yaml` |
| Coder | coding | Write code, implement features, fix bugs | `templates/coder.yaml` |
| Reviewer | review | Code review, security audit, quality control | `templates/reviewer.yaml` |
| Tester | testing | Write tests, execute tests, validate results | `templates/tester.yaml` |
| Docs | docs | Write technical docs, API docs, README | `templates/doc-writer.yaml` |

## Configuration

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

  - id: "coder-01"
    role: "coder"
    provider: "dsh"
    model: "deepseek"
    template: "./templates/coder.yaml"
    slot_id: 1
  # ...

concurrency:
  max_writers: 1  # Serial writes (first version)

memory:
  enabled: true
  persistence: true
```

### Key Config Fields

- **`provider`**: A registered DSH subagent provider name (e.g., `dsh`, `acp`, `codex`, `claude-code`)
- **`model`**: Model identifier (e.g., `deepseek`)
- **`role`**: Must be one of `leader` / `coder` / `reviewer` / `tester` / `docs`
- **`max_writers`**: Max concurrent write tasks (first version: 1, serial writes)

## Architecture

```
index.ts                          — DSH Cordis plugin entry
├── core/
│   ├── runtime/
│   │   ├── team-runtime.ts      — Team runtime (event sourcing + state projection)
│   │   ├── types.ts             — Type definitions
│   │   └── workspace-lock.ts    — Serial write lock
│   ├── orchestrator/
│   │   └── orchestration-loop.ts — Orchestration loop (Leader → execute → quality gates)
│   ├── planner/
│   │   └── leader-planner.ts    — Leader output schema validation
│   ├── quality/
│   │   └── gates.ts             — Quality gates
│   └── config/
│       └── loader.ts            — YAML config loader
├── memory/
│   ├── store.ts                 — Memory service
│   └── types.ts
├── web/
│   ├── main.tsx                 — React panel entry
│   ├── team-panel/              — UI components
│   └── types.ts                 — UI adapter layer
├── templates/                   — Role templates
├── skills/                      — SKILL.md skill definitions
├── config/                      — Team configuration
├── cordis.patch.yml             — Cordis patch layer
└── dsh.bundle.json              — DSH bundle declaration
```

## User Intervention

| Action | Effect |
|--------|--------|
| Pause | Team pauses scheduling, waits for resume |
| Resume | Team continues scheduling |
| Revise | Lead receives revision instructions and re-plans |
| Takeover | Lead pauses, waits for manual user action |
| Skip | Cancel a specific task (requires selecting the task) |

## Internationalization (i18n)

The web panel supports **bilingual** (Chinese / English) UI with automatic system language detection:

- Auto-detects via `navigator.language` on first load
- Chinese system → Chinese UI; everything else → English UI
- Manual language switch supported via `setLang('zh' | 'en')`
- All UI strings managed through a centralized translation table in `web/team-panel/i18n/index.ts`

## Development

```bash
# Install dependencies
npm install

# Type check
npm run type-check

# Build
npm run build

# Test
npm test
```

## Known Limitations

- First version: each team binds to one DSH session and one workspace
- No multi-CLI mixed teams (all members use the same provider)
- No L0–L3 memory distillation
- No multi-team collaboration
- No history replay

## License

[MIT](LICENSE)
