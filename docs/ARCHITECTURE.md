# 架构设计文档

## 1. 总体架构

### 1.1 分层架构

```
┌──────────────────────────────────────────────────────────┐
│  用户交互层 (Web UI)                                      │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 团队面板（Colleague Plugin 自有设计）              │   │
│  │  - 顶部成员栏 + 状态指示灯                         │   │
│  │  - 活动看板（TaskCard + MessageCard）              │   │
│  │  - 控制栏（筛选/排序）                             │   │
│  │  - 视图切换（并行/单聊/看板）                      │   │
│  │  - Warmup 初始化遮罩                               │   │
│  │  - 介入控制栏（暂停/修正/接管/跳过）               │   │
│  └──────────────────────────────────────────────────┘   │
├──────────────────────────────────────────────────────────┤
│  团队运行时层 (TeamRuntime)                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Leader    │  │ 事件投影  │  │ 状态机    │              │
│  │ (计划器)   │  │ (reducer) │  │ (迁移校验) │              │
│  └──────────┘  └──────────┘  └──────────┘              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ 质量门禁  │  │ 工作区锁  │  │ 记忆服务  │              │
│  │ (gates)   │  │ (串行写入) │  │ (检索注入) │              │
│  └──────────┘  └──────────┘  └──────────┘              │
├──────────────────────────────────────────────────────────┤
│  DSH Subagent 适配层                                      │
│  ┌──────────────────────────────────────────────────┐   │
│  │ ctx.subagents — DSH 原生 provider 管理             │   │
│  │ acp / codex / claude-code / dsh                    │   │
│  └──────────────────────────────────────────────────┘   │
├──────────────────────────────────────────────────────────┤
│  DSH 基础设施                                             │
│  Cordis bundle | 会话管理 | 任务生命周期 | 权限机制       │
└──────────────────────────────────────────────────────────┘
```

### 1.2 核心设计决策

1. **DSH 原生 Subagent**：每个同事通过 `ctx.subagents` 使用已注册的 DSH provider，不自管理子进程。
2. **追加事件 + 状态投影**：所有状态变更通过 `appendEvent` 完成，状态由事件投影（reducer）得出。任务与事件使用稳定 UUID。
3. **Leader 受约束的计划器**：Leader 输出经过 schema 校验（7 种 action 类型），无效输出最多重试 2 次。
4. **质量门禁**：统一结构化结果协议，`changes_requested` 和 `test_failed` 阻止最终交付。
5. **工作区串行写入锁**：coder 与 coder、coder 与 docs 不可并发写；review/test 仅在依赖完成后并发读取。
6. **事件驱动 UI**：移除轮询，通过 `subscribe` 实时响应后端事件流。
7. **事件持久化**：事件流写入 `events.jsonl`，重启后可恢复完整团队状态。

## 2. 团队配置格式

### 2.1 team.yaml

```yaml
# config/team.yaml — 团队配置文件
teamId: "frontend-team"
teamName: "前端项目组"
workspace: "/path/to/workspace"
maxConcurrentWriters: 1
memoryEnabled: true

members:
  - id: "leader-01"
    name: "组长"
    role: "leader"
    provider: "dsh"
    model: "deepseek-v3"
    slotId: 0

  - id: "coder-01"
    name: "码农"
    role: "coder"
    provider: "dsh"
    model: "deepseek-v3"
    slotId: 1

  - id: "reviewer-01"
    name: "审核员"
    role: "reviewer"
    provider: "dsh"
    model: "deepseek-v3"
    slotId: 2

  - id: "tester-01"
    name: "测试员"
    role: "tester"
    provider: "dsh"
    model: "deepseek-v3"
    slotId: 3

  - id: "docs-01"
    name: "文档员"
    role: "docs"
    provider: "dsh"
    model: "deepseek-v3"
    slotId: 4
```

### 2.2 角色定义

| 角色 | 职责 | 可用 Action |
|------|------|-------------|
| `leader` | 拆解任务、分派、流转决策 | `create_task`, `unblock_task`, `request_review`, `request_test`, `request_docs`, `report`, `ask_user` |
| `coder` | 编写代码、修复 bug | 接收 `create_task` |
| `reviewer` | 审核代码、提出修改 | 接收 `request_review` |
| `tester` | 编写测试、执行测试 | 接收 `request_test` |
| `docs` | 编写文档 | 接收 `request_docs` |

## 3. 状态模型

### 3.1 团队状态

```
idle → planning → running → paused → running（恢复）
                         → completed（完成）
                         → failed（失败）
                         → cancelled（取消）
```

### 3.2 任务状态

```
planned → ready → running → passed（通过）
                          → failed（失败）→ ready（修复重试）
                          → blocked（阻塞）→ ready（解除）
                          → cancelled（取消）
        → cancelled（直接取消）

passed → failed（审核退回）
```

### 3.3 质量状态

```
pending → approved（审核通过）
        → changes_requested（要求修改）
        → test_passed（测试通过）
        → test_failed（测试失败）
```

## 4. Leader 计划器

### 4.1 Leader Action Schema

Leader 只允许输出以下 7 种 action：

| Action | 用途 | 必填字段 |
|--------|------|----------|
| `create_task` | 创建子任务 | `title`, `description`, `role`, `dependencies` |
| `unblock_task` | 解除任务阻塞 | `taskId` |
| `request_review` | 请求审核 | `taskId` |
| `request_test` | 请求测试 | `taskId` |
| `request_docs` | 请求文档 | `taskId` |
| `report` | 汇报完成 | `summary` |
| `ask_user` | 询问用户 | `question` |

### 4.2 校验规则

- `reason` 字段必须非空
- `role` 必须是已定义角色
- `dependencies` 中的任务 ID 必须存在
- 循环依赖被拒绝
- 并发额度不超过配置上限
- 初始计划不得同时派发存在依赖关系的任务

### 4.3 重试机制

无效输出最多自动重试 2 次，仍失败则把团队置为 `blocked` 并要求用户处理。

## 5. 质量门禁

### 5.1 结构化结果协议

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

### 5.2 质量门禁规则

- `changes_requested` → 任务状态变为 `failed`，需修复后重新审核
- `test_failed` → 任务状态变为 `failed`，需修复后重新测试
- `approved` + `test_passed` → 任务状态变为 `passed`
- 没有通过审核和测试的代码不能触发 `team completed`
- 文档任务只读取已通过质量门的产出物

## 6. 工作区与并发安全

### 6.1 串行写入锁

- coder 与 coder、coder 与 docs 不可并发写
- review/test 仅在依赖完成后并发读取
- 产出物通过任务前后的 Git diff 归属

### 6.2 预检

- 目录存在
- Git 状态可读
- 允许写入范围明确
- 当前变更基线已记录

### 6.3 异常处理

- 取消、超时、权限拒绝和 provider 崩溃 → 回收后台运行，任务标为 `blocked` 或 `failed`
- 不允许暴露无认证的本地 HTTP 控制接口

## 7. 事件持久化与恢复

### 7.1 事件流

所有状态变更追加到 `events.jsonl`，每行一个 JSON 事件。事件类型包括：

- `team_created` / `team_status_changed`
- `member_added` / `member_removed`
- `task_created` / `task_status_changed` / `task_completed` / `task_failed`
- `quality_recorded` / `artifact_added`
- `message_sent` / `user_intervention` / `error`

### 7.2 恢复流程

1. 读取 `events.jsonl`
2. 验证团队 ID 匹配
3. 按顺序重放所有事件
4. 通过 reducer 投影出当前状态

## 8. 记忆系统

### 8.1 记忆类型

首版实现为持久化以下内容：

- 团队事件（`team_status_changed` 等）
- 架构决定（`team_status_changed` 中的决策记录）
- 已验证命令
- 质量结论（`quality_recorded`）

### 8.2 检索与注入

- 按任务 ID 检索相关记忆
- 注入到 Leader 或执行角色的 prompt 中
- 有数量上限（默认 5 条）和字符上限（默认 4000 字符），避免无限增长
