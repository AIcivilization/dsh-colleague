# Colleague Plugin — 产品说明

> 有记忆、有角色的长期 AI 团队 — 基于 DeepSeek Harness (DSH) 的多 Agent 协作插件
>
> Version 0.1.0 | MIT License

---

## 1. 产品概述

Colleague Plugin 是一个 DSH (DeepSeek Harness) Cordis 插件，实现可控的多 Agent 软件交付闭环。

用户给出目标 → Leader 拆解为子任务 → Coder 写代码 → Reviewer 审核 → Tester 测试 → Docs 补文档 → 全部通过后汇报。

### 核心特性

- 基于 DSH 原生 Subagent，不自管理子进程
- 追加事件 + 状态投影模型管理团队状态
- Leader 输出经过 schema 校验，非任意 JSON
- 质量门禁：审核退回和测试失败阻止最终交付
- 工作区串行写入锁，防止并发冲突
- 持久化事件流，重启后可恢复状态
- 事件驱动 UI，不再轮询

---

## 2. 系统架构

```
┌──────────────────────────────────────────────────────┐
│                  DSH (DeepSeek Harness)               │
│                                                       │
│  ┌──────────────────────────────────────────────────┐ │
│  │           Colleague Plugin (Cordis)              │ │
│  │                                                  │ │
│  │  ┌─────────────┐  ┌──────────────┐             │ │
│  │  │ TeamRuntime │  │ MemoryService│             │ │
│  │  │ (状态投影)   │  │ (记忆注入)    │             │ │
│  │  └──────┬──────┘  └──────────────┘             │ │
│  │         │                                        │ │
│  │  ┌──────┴──────────────────────────┐            │ │
│  │  │     WorkspaceLock (串行写入)     │            │ │
│  │  └──────────────────────────────────┘            │ │
│  │                                                  │ │
│  │  ┌──────────────────────────────────┐            │ │
│  │  │     Web Panel (React 嵌入面板)   │            │ │
│  │  │     事件驱动，不再轮询             │            │ │
│  │  └──────────────────────────────────┘            │ │
│  └──────────────────────────────────────────────────┘ │
│                        │                              │
│           ┌────────────┼────────────┐                 │
│           ▼            ▼            ▼                 │
│    ctx.subagents (DSH 原生 provider)                   │
│    acp / codex / claude-code / dsh                     │
└──────────────────────────────────────────────────────┘
```

---

## 3. 团队角色

| 角色 | 职责 | 状态机 |
|------|------|--------|
| Leader | 拆解目标、分派任务、决策流转 | 受约束计划器，输出经 schema 校验 |
| Coder | 编写代码、实现功能、修复 bug | planned → ready → running → passed/failed |
| Reviewer | Code review、安全审计 | 审核结果：approved / changes_requested |
| Tester | 编写测试、执行测试 | 测试结果：test_passed / test_failed |
| Docs | 编写技术文档、README | 只读取已通过质量门的产出物 |

---

## 4. 质量门禁

### 结构化结果协议

所有角色返回统一结构化结果：

```json
{
  "status": "completed | failed | blocked",
  "summary": "任务摘要",
  "artifacts": ["path/to/file.ts"],
  "issues": [
    {
      "severity": "critical | warning | suggestion",
      "file": "path/to/file.ts",
      "line": 42,
      "description": "问题描述",
      "suggestion": "修复建议"
    }
  ],
  "testCommand": "npm test",
  "testOutput": "...",
  "blockedReason": "阻塞原因"
}
```

### 门禁规则

- Reviewer 的 `changes_requested` 阻止最终交付 → 自动创建修复任务
- Tester 的 `test_failed` 阻止最终交付 → 自动创建修复任务
- Docs 任务只读取已通过质量门的产出物
- 没有通过审核和测试的代码不能触发 `team completed`
- Agent 返回非结构化内容时，任务不会被误标记为通过

---

## 5. 工作区与并发安全

- 工作区由父 DSH session 提供
- 启动前预检：目录存在、Git 状态可读
- 串行写入：coder 与 coder、coder 与 docs 不可并发写
- 产出物通过任务前后的 Git diff 归属
- 取消、超时、权限拒绝和 provider 崩溃必须回收后台运行
- 不允许暴露无认证的本地 HTTP 控制接口

---

## 6. 记忆系统

首版实现为持久化团队事件、架构决定、已验证命令和质量结论。

- 持久化路径：`{workspace}/.colleague/memory/memory.jsonl`
- 按任务检索少量相关内容注入 Leader 或执行角色
- 单次注入上限：5 条记忆，每条 500 字符，总计 2000 字符
- 重启后可检索上一任务的架构决定和测试结论
- L0–L3 蒸馏移入后续版本

---

## 7. 用户介入

| 操作 | 路由 | 效果 |
|------|------|------|
| 暂停 | teamId | 团队暂停调度 |
| 恢复 | teamId | 团队继续调度 |
| 修正 | teamId + message | Leader 接收修正指令 |
| 接管 | teamId | Leader 暂停，等待用户 |
| 跳过 | teamId + taskId | 取消指定任务 |

所有介入操作等待服务端确认后更新 UI。

---

## 8. Web 面板

### 三种视图

| 视图 | 布局 |
|------|------|
| 并行 (parallel) | 按成员分组，水平排列，每列显示该成员的任务和消息 |
| 单聊 (single) | 只显示选中成员的活动流 |
| 看板 (board) | 多列并行展示，包含筛选和排序 |

### 事件驱动

面板通过 `TeamRuntime.subscribe()` 订阅事件流，不再使用 500ms/1s 轮询。

### 组件清单

| 组件 | 职责 |
|------|------|
| TeamPage | 主页面，组装所有组件 |
| TeamTabs | 成员胶囊栏 |
| AgentStatusBadge | 状态徽章 |
| TeamViewToggle | 视图切换 |
| ActivityBoardLayout | 看板布局 |
| ActivityControlBar | 筛选和排序 |
| TaskCard | 任务卡片 |
| MessageCard | 消息卡片 |
| InterventionBar | 介入控制栏 |
| TeamWarmupOverlay | 初始化遮罩 |

---

## 9. 配置

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
  # ...

workspace:
  path: "./workspace/"

concurrency:
  max_writers: 1

memory:
  enabled: true
  persistence: true
```

### 插件配置 (`cordis.yml`)

```yaml
- id: colleague-plugin
  name: 'colleague-plugin'
  config:
    configPath: 'config/team.yaml'
    maxConcurrentWriters: 1
    memoryEnabled: true
```

---

## 10. 技术栈

| 层 | 技术 |
|------|------|
| 插件框架 | Cordis (DSH 原生) |
| 前端框架 | React 18 + TypeScript 5.8 |
| 构建工具 | tsdown |
| YAML 解析 | yaml |
| 测试 | vitest |
| 通信 | DSH Subagent (ctx.subagents) |

---

## 11. 已知限制

- 首版每个团队绑定一个 DSH 会话和一个工作区
- 不支持多 CLI 混合团队
- 不支持 L0–L3 记忆蒸馏
- 不支持多团队协作
- 不支持历史回放
- 不支持插件市场发布

---

## 12. 路线图

### 已完成 (v0.1)

- [x] DSH Cordis 插件入口
- [x] TeamRuntime 状态机（追加事件 + 状态投影）
- [x] Leader 受约束计划器（schema 校验）
- [x] 质量门禁（结构化结果协议）
- [x] 工作区串行写入锁
- [x] 事件驱动 UI
- [x] 事件持久化和重启恢复
- [x] 记忆服务（持久化 + 注入上限）
- [x] 自动化测试（单元、契约、集成、E2E）
- [x] dsh.bundle manifest 和 cordis.patch.yml
- [x] CHANGELOG 与产品文档

### 计划中

- [ ] 记忆蒸馏管道（L0→L1→L2→L3）
- [ ] 多 CLI 混合团队
- [ ] 团队历史回放
- [ ] 插件市场发布
