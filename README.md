# dsh-colleague

> 有记忆、有角色的长期 AI 团队 — 基于 DeepSeek Harness (DSH) 的多 Agent 协作插件

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 是什么

dsh-colleague 是一个 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) Cordis 插件，让多个 AI Agent 像真正的同事一样组队干活：

- **Leader 拆解目标** → Coder 写代码 → Reviewer 审核代码 → Tester 测试验证 → Docs 补文档
- 全自动流转，用户随时可以暂停、修正、接管或跳过
- 基于 DSH 原生 Subagent 架构，不自己管理子进程

## 快速开始

### 前置条件

- Node.js `>= 22.19.0`
- 已安装 DSH (`dsh --version` >= 0.1.0-rc.8)
- 已在 DSH 中注册至少一个 subagent provider

### 一键安装

```bash
# 克隆仓库
git clone https://github.com/AIcivilization/dsh-colleague.git
cd dsh-colleague

# 一键安装（构建 + 注册到 DSH + 重启 + 验证）
bash scripts/install-to-dsh-web.sh
```

脚本会自动完成：
1. 构建 `dist/`
2. 用 `dsh plugin --profile web add file://` 安装到 web profile
3. 重启 DSH web
4. 验证插件已挂载、API 路由可用

安装完成后打开 http://127.0.0.1:3080 ，在 **设置 → 插件** 中可以看到 `dsh-colleague`。

### 手动安装

```bash
# 构建
npm install
npm run build

# 安装到 DSH
dsh plugin --profile web add file:///path/to/dsh-colleague

# 重启 DSH
dsh web
```

## 团队角色

| 角色 | 技能 | 职责 | 模板文件 |
|------|------|------|----------|
| Leader | orchestration | 拆解目标、分派任务、决策流转 | `templates/orchestrator.yaml` |
| Coder | coding | 编写代码、实现功能、修复 bug | `templates/coder.yaml` |
| Reviewer | review | Code review、安全审计、质量把关 | `templates/reviewer.yaml` |
| Tester | testing | 编写测试、执行测试、验证结果 | `templates/tester.yaml` |
| Docs | docs | 编写技术文档、API 文档、README | `templates/doc-writer.yaml` |

## 配置

### 团队配置 (`config/team.yaml`)

```yaml
team:
  name: "前端项目组"

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
  max_writers: 1  # 首版串行写入

memory:
  enabled: true
  persistence: true
```

### 关键配置说明

- **`provider`**: DSH 已注册的 subagent provider 名称（如 `dsh`、`acp`、`codex`、`claude-code`）
- **`model`**: 模型标识（如 `deepseek`）
- **`role`**: 必须是 `leader` / `coder` / `reviewer` / `tester` / `docs` 之一
- **`max_writers`**: 最大并发写任务数，首版固定为 1（串行写入）

## 架构

```
index.ts                          — DSH Cordis 插件入口
├── core/
│   ├── runtime/
│   │   ├── team-runtime.ts      — 团队运行时（事件溯源 + 状态投影）
│   │   ├── types.ts             — 类型定义
│   │   └── workspace-lock.ts    — 串行写入锁
│   ├── orchestrator/
│   │   └── orchestration-loop.ts — 编排循环（Leader → 执行 → 质量门禁）
│   ├── planner/
│   │   └── leader-planner.ts    — Leader 输出 schema 校验
│   ├── quality/
│   │   └── gates.ts             — 质量门禁
│   └── config/
│       └── loader.ts            — YAML 配置加载器
├── memory/
│   ├── store.ts                 — 记忆服务
│   └── types.ts
├── web/
│   ├── main.tsx                 — React 面板入口
│   ├── team-panel/              — UI 组件
│   └── types.ts                 — UI 适配层
├── templates/                   — 角色模板
├── skills/                      — SKILL.md 技能定义
├── config/                      — 团队配置
├── cordis.patch.yml             — Cordis 补丁层
└── dsh.bundle.json              — DSH bundle 声明
```

## 用户介入

| 操作 | 效果 |
|------|------|
| 暂停 | 团队暂停调度，等待恢复 |
| 恢复 | 团队继续调度 |
| 修正 | Leader 接收修正指令，重新规划 |
| 接管 | Leader 暂停，等待用户手动操作 |
| 跳过 | 取消指定任务（需选择具体任务） |

## 开发

```bash
# 安装依赖
npm install

# 类型检查
npm run type-check

# 构建
npm run build

# 测试
npm test
```

## 已知限制

- 首版每个团队绑定一个 DSH 会话和一个工作区
- 不支持多 CLI 混合团队（所有成员使用同一 provider）
- 不支持 L0–L3 记忆蒸馏
- 不支持多团队协作
- 不支持历史回放

## License

[MIT](LICENSE)
