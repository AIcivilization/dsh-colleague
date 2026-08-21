# Colleague Plugin — 完整产品说明

> **有记忆、有角色的长期 AI 团队 — 基于多 Agent 协作的开发插件**
>
> 让多个 AI CLI Agent 像真正的同事一样组队干活：组织者拆任务、码农写代码、审核员 review、测试员测试、文档员补文档 — 全自动流转，用户随时介入。
>
> Version 1.0.0 | MIT License

---

## 目录

1. [产品概述](#1-产品概述)
2. [核心理念](#2-核心理念)
3. [功能清单](#3-功能清单)
4. [系统架构](#4-系统架构)
5. [核心机制详解](#5-核心机制详解)
6. [团队成员与角色](#6-团队成员与角色)
7. [Agent 自动发现](#7-agent-自动发现)
8. [ACP 协议与会话管理](#8-acp-协议与会话管理)
9. [LLM 集成](#9-llm-集成)
10. [记忆系统](#10-记忆系统)
11. [Web UI 团队面板](#11-web-ui-团队面板)
12. [设计系统](#12-设计系统)
13. [国际化](#13-国际化)
14. [配置系统](#14-配置系统)
15. [技能与模板](#15-技能与模板)
16. [API 接口](#16-api-接口)
17. [开发指南](#17-开发指南)
18. [使用指南](#18-使用指南)
19. [项目结构](#19-项目结构)
20. [路线图](#20-路线图)

---

## 1. 产品概述

### 1.1 是什么

Colleague Plugin 是一个多 Agent 协作插件，让用户能够：

- **自动发现**系统中已安装的 AI CLI 工具（Claude Code、Codex、Gemini CLI 等 20+ 种）
- **组建团队**：选一个 CLI 作为执行引擎，自动创建 5 个角色化的 AI 同事
- **给个目标，团队自跑**：组织者拆解目标 → 分派任务 → 码农写代码 → 审核员 review → 测试员测试 → 文档员补文档
- **全程可视、随时介入**：通过 Web UI 实时查看团队进度，随时暂停、修正、接管或跳过

### 1.2 解决什么问题

当前 AI 编码助手（如 Claude Code、Codex）功能强大但都是**单兵作战**：

- 一个 Agent 负责从设计到测试到文档的所有事，没有专业分工
- 没有审核环节，代码质量全靠 Agent 自觉
- 没有团队协作机制，无法模拟真实软件开发流程
- 用户无法在流程中间介入修正方向

Colleague Plugin 用**组织化协作**的方式解决这些问题：

```
用户："做一个带表单验证的登录页"
    │
    ▼
组织者拆解为 5 个子任务 → 分派给 4 个专业同事
    │
    ├── 码农：实现登录组件 + 验证逻辑
    ├── 审核员：Review 代码质量和安全性
    ├── 测试员：编写单元测试并执行
    └── 文档员：编写 README 和 API 文档
    │
    ▼
组织者根据黑板状态动态决策流转
（审核不通过 → 退回码农修 → 再审 → 通过 → 测试 → ...）
    │
    ▼
全部完成 → 组织者向用户汇报
```

### 1.3 设计灵感

本项目 UI 设计**照搬 AionUi**（aionui.com）的设计系统，包括：

- AOU 紫色品牌色系（10 级灰紫渐变）
- 11 级灰阶背景色系统
- 像素级精确间距（非 Tailwind 默认 4px 基数）
- 胶囊式成员栏、看板列布局、分段控件、Toggle 开关
- 完整的 Light/Dark 双主题
- 精致的内联 SVG 图标体系

架构设计参考了 AionUi 的以下机制：

- Agent 自动发现（`binaryResolver.ts`）
- ACP 协议会话管理
- 团队 Warmup 初始化流程
- 成员身份色系统
- 活动看板布局

---

## 2. 核心理念

### 2.1 三大分离

| 原则 | 说明 | 实现方式 |
|------|------|----------|
| **决策与执行分离** | Leader 只做决策不干活，同事只干活不做决策 | Leader 用 LLM 做决策；同事用 CLI 执行任务 |
| **状态与通信分离** | 工作成果存黑板，通信走 mailbox，互不耦合 | `BlackboardStore` + `MailboxStore` 独立模块 |
| **技能与人设分离** | 同事的能力由模板定义，人设由 prompt 注入 | `templates/*.yaml` + `skills/*/SKILL.md` |

### 2.2 动态决策（非预定义流程）

传统的多 Agent 框架用**状态机**或**预定义流程图**控制流转：

```
传统方式：task_complete → → review → test → docs（固定链）
```

Colleague Plugin 的 Leader **不按固定流程走**，而是像人类项目经理一样：

1. 看黑板上的当前状态（谁完成了什么、谁在忙、结果如何）
2. 自己判断下一步该让谁干什么
3. 如果审核发现问题，退回给码农修
4. 如果测试失败，也退回给码农修
5. 全部通过，可以让文档员补文档
6. 用户随时可以打断

### 2.3 模型族绑定（非版本锁定）

每个同事绑定一个**模型族**（如 `deepseek`、`gpt`、`claude`），而非具体版本：

- 绑定 `deepseek` 族 → 当前用 `deepseek-v3` → 将来可升级到 `deepseek-v4`
- 绑定 `gpt` 族 → 当前用 `gpt-5.6` → 将来可升级到 `gpt-5.7`

这样同事的"能力"是稳定的，但底层模型可以持续升级。

---

## 3. 功能清单

### 3.1 核心功能

| 功能 | 描述 |
|------|------|
| Agent 自动发现 | 扫描 PATH 中 20+ 种已知 ACP 兼容 CLI，做 ACP 握手获取能力声明 |
| 团队组建 | 选一个 CLI → 自动创建 5 个角色化同事（组织者 + 码农 + 审核员 + 测试员 + 文档员）|
| 目标拆解 | Leader 接收用户目标 → 用 LLM 拆解为可执行子任务 → 分派给合适同事 |
| 动态流转 | Leader 看黑板状态 → 自己决策下一步 → 不按固定流程 |
| 并行执行 | 多个同事可以同时执行各自任务（异步非阻塞）|
| 实时监控 | Web UI 看板视图实时展示每个成员的任务和消息 |
| 用户介入 | 暂停 / 恢复 / 修正 / 接管 / 跳过 — 随时打断 |
| 流式输出 | 同事执行任务时，流式输出实时推送给 UI |
| 产出物追踪 | 每个任务改了哪些文件，记录在黑板产出物列表中 |
| 上下文交接 | 同事之间通过 mailbox 传递上下文和附件 |

### 3.2 UI 功能

| 功能 | 描述 |
|------|------|
| CLI 发现界面 | 精致的卡片网格展示可用 CLI，用户选择后一键创建团队 |
| 团队面板 | 五层界面结构：标题栏 → 成员栏 → 控制栏 → 看板 → 介入栏 |
| 成员胶囊栏 | 横向滚动展示每个成员的状态徽章、头像、名称，支持双击重命名 |
| 视图切换 | 并行 / 单聊 / 看板三种视图模式 |
| 活动看板 | 每个成员一列，列内展示任务卡片和消息卡片 |
| 控制栏 | 排序方向、内容过滤（全部/消息/任务）、成员筛选下拉、系统消息/已完成任务 Toggle 开关 |
| 任务卡片 | 状态标签、负责人色点、依赖关系 chip、描述展开/折叠 |
| 消息卡片 | from→to、广播标签、已读/未读、附件、内容展开/折叠 |
| Warmup 遮罩 | 初始化时的磨砂玻璃遮罩，进度条扫动 + 头像呼吸动画 |
| 介入控制栏 | 底部固定栏：暂停/恢复/修正/接管/跳过 |
| 成员身份色 | 8 色低饱和色板，Leader 固定品牌色，成员色持久化在 localStorage |
| 暗色模式 | 自动检测系统 `prefers-color-scheme`，CSS 变量全覆盖 |
| 国际化 | 自动检测 `navigator.language`，支持中英文切换 |
| 滚动条 | 照搬 AionUi 的 6px 透明滚动条，hover 时显示 |

---

## 4. 系统架构

### 4.1 整体架构图

```
┌──────────────────────────────────────────────────────────────────┐
│                        用户 (User)                               │
│                   ┌─────────────────────┐                       │
│                   │   Web UI 团队面板    │                       │
│                   │  (React + Tailwind)  │                       │
│                   └──────────┬──────────┘                       │
│                              │ HTTP /api/*                      │
┌──────────────────────────────┼───────────────────────────────────┐
│                     Express API Server                          │
│                              │                                   │
│           ┌──────────────────┼──────────────────┐               │
│           ▼                  ▼                  ▼               │
│    ┌─────────────┐   ┌──────────────┐  ┌──────────────┐        │
│    │  Agent 发现  │   │  编排引擎     │  │  LLM Provider│        │
│    │  (discovery) │   │ (orchestrator)│  │  (provider)  │        │
│    └─────────────┘   └──────┬───────┘  └──────────────┘        │
│                              │                                   │
│              ┌───────────────┼───────────────┐                  │
│              ▼               ▼               ▼                  │
│      ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │
│      │  Blackboard   │ │   Mailbox    │ │  ACP Session │       │
│      │  (共享状态)   │ │  (通信管道)   │ │  (会话管理)   │       │
│      └──────────────┘ └──────────────┘ └──────────────┘       │
│                              │                                   │
│              ┌───────────────┼───────────────┐                  │
│              ▼               ▼               ▼                  │
│      ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │
│      │ Claude Code  │ │    Codex      │ │  Gemini CLI  │       │
│      │  (子进程)     │ │  (子进程)     │ │  (子进程)     │       │
│      └──────────────┘ └──────────────┘ └──────────────┘       │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 三大核心模块

| 模块 | 文件 | 职责 |
|------|------|------|
| **Blackboard**（黑板） | `core/blackboard/` | 共享状态空间，所有人都能读写。存任务、产出物、成员状态、上下文交接 |
| **Mailbox**（邮箱） | `core/mailbox/` | 纯通信管道，不做任何决策。Leader → 同事传递指令，同事 → Leader 传递完成通知 |
| **Orchestration Engine**（编排引擎） | `core/orchestrator/` | 三合一：Leader 决策 + 黑板 + mailbox。动态决策循环，用户介入处理 |

### 4.3 数据流

```
1. 用户在 UI 选择 CLI → POST /api/team/create
2. Server 创建 Engine → 初始化 5 个成员
3. 用户输入目标 → Engine.startGoal()
4. Leader 调 LLM 拆解目标 → 返回子任务列表
5. 为每个子任务创建 Task → mailbox 通知同事 → 异步执行
6. 同事通过 ACP 协议启动 CLI 子进程 → 发送任务 prompt → 流式收集响应
7. 同事完成 → 黑板更新任务状态 + 产出物 → mailbox 通知 Leader
8. Leader 看黑板 → 调 LLM 决策下一步 → assign/wait/report/revise
9. 前端每秒轮询 /api/team/state → 获取快照 + 消息 + 事件
10. 用户随时通过 UI 介入 → POST /api/team/pause|resume|revise|takeover|skip
```

---

## 5. 核心机制详解

### 5.1 Leader 决策循环

```typescript
// core/orchestrator/engine.ts — decisionLoop()

while (this.running && !this.blackboard.isAllDone()) {
  // 1. 检查用户介入
  if (hasIntervention) {
    await this.handleIntervention(interventionMsg);
    continue;
  }

  // 2. 阻塞等待同事完成消息
  const completionMsg = await this.mailbox.receive(this.leaderId);

  // 3. Leader 看黑板状态，调 LLM 做决策
  const decision = await this.leaderDecide();
  //    → LLM 返回 JSON: { action, task, reason, summary }

  // 4. 执行决策
  switch (decision.action) {
    case 'assign':  // 分派新任务
    case 'wait':    // 继续等待
    case 'report':  // 全部完成，汇报用户
    case 'revise':  // 用户要求修正计划
  }
}
```

### 5.2 任务执行流程

```typescript
// core/orchestrator/engine.ts — executeColleagueTask()

// 1. 获取同事配置
const config = this.colleagues.get(colleagueId);

// 2. 构建 ACP 配置
const acpConfig = {
  command: config.command,     // 如 'claude'
  cwd: this.workspace,         // 共享工作区
  skillPrompt: config.skillPrompt, // 技能 prompt
};

// 3. 执行任务（ACP 会话）
const result = await executeColleagueTask(acpConfig, taskDescription, onStream);
//    → 启动 CLI 子进程
//    → ACP 握手
//    → 创建会话
//    → 发送 prompt（技能指令 + 任务描述）
//    → 流式收集响应
//    → 返回结果

// 4. 更新黑板
if (result.success) {
  blackboard.updateTaskStatus(taskId, 'completed', { summary, artifacts });
  blackboard.addArtifact({ task_id, author, type: 'code', content: filePath });
}

// 5. mailbox 通知 Leader
mailbox.send(leaderId, { type: 'task_complete', from: colleagueId, ... });
```

### 5.3 用户介入

```typescript
// 5 种介入方式
engine.pause();              // 暂停决策循环
engine.resume();             // 恢复
engine.revise("改用 React Hook"); // 修正指令
engine.takeover();           // 用户接管，Leader 等待
engine.skip(taskId);         // 跳过某个任务

// 介入通过 mailbox 传递
mailbox.sendIntervention({ type: 'pause', from: 'user' });

// Leader 在决策循环中检查
if (hasIntervention) {
  await this.handleIntervention(interventionMsg);
}
```

---

## 6. 团队成员与角色

### 6.1 成员定义

| 角色 | ID | 名称 | 职责 | 模板文件 |
|------|-----|------|------|----------|
| Leader | `leader-01` | 组织者 | 拆解目标、分派任务、动态决策流转 | `templates/orchestrator.yaml` |
| Member | `coder-01` | 码农 | 编写代码、实现功能、修复 bug | `templates/coder.yaml` |
| Member | `reviewer-01` | 审核员 | Code review、安全审计、质量把关 | `templates/reviewer.yaml` |
| Member | `tester-01` | 测试员 | 编写测试用例、执行测试、验证结果 | `templates/tester.yaml` |
| Member | `docs-01` | 文档员 | 编写技术文档、API 文档、README | `templates/doc-writer.yaml` |

### 6.2 成员状态机

```
                ┌──────────┐
                │ dormant  │ ← 初始未唤醒
                └────┬─────┘
                     │ 被分派任务
                     ▼
                ┌──────────┐
        ┌──────│ pending  │
        │       └────┬─────┘
        │            │ 开始执行
        │            ▼
        │       ┌──────────┐
        │       │  active  │ ← 正在执行任务
        │       └────┬─────┘
        │            │ 任务完成
        │            ▼
        │       ┌──────────┐
        │       │   idle   │ ← 空闲，等待新任务
        │       └────┬─────┘
        │            │ 被分派新任务
        └────────────┘
                     │ 任务失败
                     ▼
                ┌──────────┐
                │  failed  │
                └──────────┘
```

### 6.3 状态徽章配色

| 状态 | 颜色 | 动画 |
|------|------|------|
| pending | `var(--bg-6)` 灰 | — |
| idle | `var(--bg-6)` 灰 | — |
| active | `var(--success)` 绿 | `animate-pulse` 闪烁 |
| completed | `var(--bg-6)` 灰 | — |
| failed | `var(--danger)` 红 | — |
| dormant | 透明 + `var(--bg-6)` 描边 | — |

---

## 7. Agent 自动发现

### 7.1 已知 CLI 列表

支持自动发现 20+ 种 ACP 兼容的 CLI Agent：

| CLI 名称 | 命令 | 说明 |
|----------|------|------|
| Claude Code | `claude` | Anthropic 的 CLI 编码助手 |
| Codex | `codex` | OpenAI 的 CLI 编码助手 |
| Gemini CLI | `gemini` | Google 的 CLI 编码助手 |
| Qwen Code | `qwen` | 阿里通义千问 CLI |
| Goose | `goose` | Goose CLI |
| Kimi CLI | `kimi` | 月之暗面 Kimi CLI |
| Cursor Agent | `cursor-agent` | Cursor 编辑器的 Agent |
| Augment Code | `augment` | Augment 编码助手 |
| OpenCode | `opencode` | OpenCode CLI |
| Aion CLI | `aion` | AionUi 自带 CLI |
| Hermes | `hermes` | Hermes CLI |
| ... | ... | 更多见 `core/discovery/agent-discovery.ts` |

### 7.2 发现流程

```
1. 遍历已知 CLI 列表
2. 用 which/where 在 PATH 中查找可执行文件
3. 如果找到 → 执行 --version 获取版本号
4. 对找到的 CLI 做 ACP 握手：
   a. 启动子进程: <command> --acp
   b. 发送 JSON-RPC initialize 请求
   c. 接收能力声明（protocolVersion, tools, depth, yoloMode）
   d. 关闭子进程
5. 返回发现结果列表
```

### 7.3 ACP 握手协议

```json
// 请求
{ "jsonrpc": "2.0", "id": 1, "method": "initialize",
  "params": { "protocolVersion": "1.0.0",
              "client": { "name": "colleague-plugin", "version": "1.0.0" } } }

// 响应
{ "jsonrpc": "2.0", "id": 1, "result":
  { "protocolVersion": "1.0.0",
    "capabilities": { "tools": ["readFile","writeFile","editFile"],
                      "depth": 10, "yoloMode": false } } }
```

---

## 8. ACP 协议与会话管理

### 8.1 ACP (Agent Client Protocol)

ACP 是一个基于 JSON-RPC over stdio 的协议，用于与 CLI Agent 通信。

### 8.2 会话生命周期

```
1. start()      — 启动 CLI 子进程 + initialize 握手
2. newSession() — 创建工作会话（指定 cwd, permission, mcpTools）
3. sendPrompt() — 发送任务 prompt，流式收集响应
4. close()      — 结束会话 + 终止子进程
```

### 8.3 JSON-RPC 通信层

`JsonRpcConnection` 类实现了：

- **请求-响应模式**：带 `id` 的消息，等待匹配的响应
- **通知模式**：无 `id` 的消息，单向推送
- **流式回调**：`session/stream` 通知推送文本、工具调用、工具结果
- **超时处理**：每个请求有独立超时计时器
- **换行分隔**：ACP 用 newline-delimited JSON

### 8.4 权限模式

| 模式 | 说明 |
|------|------|
| `reject` | 自动拒绝所有权限请求（安全第一）|
| `allow` | 自动允许所有操作 |
| `ask` | 通过回调询问用户 |

默认使用 `reject` 模式，确保同事不会做危险操作。

---

## 9. LLM 集成

### 9.1 OpenAI 兼容 Provider

`core/llm/provider.ts` 实现了 `LLMProvider` 接口，支持所有 OpenAI 兼容的 API：

```typescript
// 同步调用
const result = await provider.complete(prompt, context);

// 流式调用
for await (const chunk of provider.stream(prompt, context)) {
  console.log(chunk);
}
```

### 9.2 预设配置

| Provider | 函数 | 默认模型 |
|----------|------|----------|
| DeepSeek | `createDeepSeekProvider()` | `deepseek-chat` |
| OpenAI | `createOpenAIProvider()` | `gpt-4o` |
| Ollama (本地) | `createOllamaProvider()` | `qwen2.5-coder` |
| 通用 | `createLLMProvider()` | 从环境变量读取 |

### 9.3 环境变量

```bash
LLM_API_KEY=sk-...          # API 密钥
LLM_BASE_URL=https://...     # API base URL
LLM_MODEL=deepseek-chat      # 模型名
```

### 9.4 Fallback 机制

如果未配置 LLM 环境变量，Server 会用用户选的 CLI 作为 LLM fallback：

```typescript
llm = {
  complete: async (prompt, context) => {
    const result = execSync(`${cliCmd} -p "${fullPrompt}"`, { timeout: 60000 });
    return result.trim();
  }
};
```

### 9.5 System Prompt 设计

LLM Provider 内置了两套 system prompt：

**拆解阶段**（context 含 goal）：
- 告诉 LLM 它是 Leader
- 输出 JSON 格式的任务列表
- 规则：按技能匹配分派、每个子任务可独立完成

**决策阶段**（context 含 tasks/member_states）：
- 告诉 LLM 查看黑板状态
- 输出 JSON 格式的决策（assign/wait/report/revise）
- 规则：动态决策、不按固定流程、服从用户介入

---

## 10. 记忆系统

### 10.1 四层记忆架构

```
L0: 原始日志    — 每次交互的完整记录
 │  蒸馏
 ▼
L1: 情景记忆    — 从日志中提取的上下文片段
 │  蒸馏
 ▼
L2: 语义记忆    — 从情景记忆中蒸馏的知识
 │  蒸馏
 ▼
L3: 团队规范    — 从语义记忆中提取的团队级规则
```

### 10.2 记忆分类

| 类型 | 接口 | 说明 |
|------|------|------|
| 个人记忆 | `IndividualMemory` | 每个同事的偏好、工作习惯、常见错误 |
| 跨人记忆 | `CrossColleagueMemory` | 协作历史、交接记录、冲突记录 |
| 团队记忆 | `TeamMemory` | 团队规范、架构决策、项目上下文、风格指南 |
| 技能记忆 | `SkillMemory` | 可复用模式、代码模板、经验教训 |

### 10.3 记忆注入策略

不是每次全量注入，避免 token 爆炸：

1. **个人记忆**：按需检索，只注入和当前任务相关的记忆片段
2. **团队记忆**：Leader 始终持有，同事按需查询
3. **技能记忆**：任务匹配时自动加载对应 skill

记忆条目支持向量嵌入（`embedding` 字段），可用于 RAG 检索。

---

## 11. Web UI 团队面板

### 11.1 五层界面结构

```
┌─────────────────────────────────────────────────────┐
│  标题栏：团队名 + 视图切换              h-40px      │
├─────────────────────────────────────────────────────┤
│  成员栏：[组织者] [码农] [审核员] [测试员] [文档员]  │
│          + 添加成员                         min-h-48px │
├──────────┬──────────┬──────────┬──────────┬─────────┤
│  控制栏：[最新/最旧] [全部/消息/任务] [筛选▼]        │
├──────────┼──────────┼──────────┼──────────┼─────────┤
│  组织者列 │  码农列  │ 审核员列  │ 测试员列  │ 文档员列 │
│          │          │          │          │         │
│ TaskCard │ TaskCard │          │          │         │
│ MsgCard  │ MsgCard  │          │          │         │
│          │          │          │          │         │
├──────────┴──────────┴──────────┴──────────┴─────────┤
│  介入栏：[暂停] [修正] [接管] [跳过]      介入       │
└─────────────────────────────────────────────────────┘
```

### 11.2 组件清单

| 组件 | 文件 | 职责 |
|------|------|------|
| `TeamPage` | `web/team-panel/index.tsx` | 主页面入口，组装所有组件 |
| `TeamTabs` | `components/TeamTabs.tsx` | 成员胶囊栏，支持滚动、重命名、增删 |
| `AgentStatusBadge` | `components/AgentStatusBadge.tsx` | 头像右下角状态徽章 |
| `TeamViewToggle` | `components/ViewToggle.tsx` | 并行/单聊/看板视图切换 |
| `ActivityBoardLayout` | `components/ActivityBoardLayout.tsx` | 看板列布局 |
| `ActivityControlBar` | `components/ActivityControlBar.tsx` | 筛选和排序控制 |
| `TaskCard` | `components/TaskCard.tsx` | 任务卡片 |
| `MessageCard` | `components/MessageCard.tsx` | 消息卡片 |
| `InterventionBar` | `components/InterventionBar.tsx` | 底部介入控制栏（差异化新增）|
| `TeamWarmupOverlay` | `components/TeamWarmupOverlay.tsx` | 初始化磨砂玻璃遮罩 |

### 11.3 Hooks 清单

| Hook | 文件 | 职责 |
|------|------|------|
| `useTeamActivityFeed` | `hooks/useTeamActivityFeed.ts` | 活动流数据轮询 |
| `useTeamActivityControls` | `hooks/useTeamActivityControls.ts` | 控制栏状态管理 |
| `useTeamViewMode` | `hooks/useTeamViewMode.ts` | 视图模式持久化 |
| `useTeamWarmup` | `hooks/useTeamWarmup.ts` | Warmup 状态判定 |
| `useTeamMemberColors` | `hooks/useTeamMemberColors.ts` | 成员身份色分配与持久化 |
| `useIsClamped` | `hooks/useIsClamped.ts` | 检测元素是否被 line-clamp 截断 |

### 11.4 成员身份色系统

8 色低饱和色板，索引 0 固定给 Leader（品牌色）：

| 索引 | 色值 | 名称 | 用途 |
|------|------|------|------|
| 0 | `var(--brand)` `#7583b2` | 品牌色 | Leader（固定）|
| 1 | `#5c9ea4` | 雾青 | 第 1 个 member |
| 2 | `#b58a5e` | 暖褐 | 第 2 个 member |
| 3 | `#9481bf` | 藕紫 | 第 3 个 member |
| 4 | `#c07d97` | 豆沙玫 | 第 4 个 member |
| 5 | `#6ba07e` | 灰绿 | 第 5 个 member |
| 6 | `#4f8ac9` | 雾蓝 | 第 6 个 member |
| 7 | `#c99a4b` | 琥珀 | 第 7 个 member |

**分配算法**：Leader → 色号 0（钉死）；已分配的成员 → 沿用原色号；新成员 → 取当前未占用的最小非 0 色号。持久化在 `localStorage`，键名 `team-member-colors-{teamId}`。

### 11.5 Warmup 初始化流程

```
1. 团队创建 → 所有成员状态 = dormant
2. UI 检测到 dormant 成员 → 显示 Warmup 遮罩
3. 遮罩内容：
   - 头像列表（pending 成员呼吸动画）
   - "正在唤醒团队…" 标题
   - 进度条（无确定进度，来回扫动）
4. 成员状态变为 idle/active/dormant → 视为 ready → 遮罩消失
5. 如果有成员 failed → 显示错误卡片 + 重试按钮
```

---

## 12. 设计系统

### 12.1 照搬 AionUi

本项目完整照搬 AionUi（aionui.com）的设计系统，详见 `docs/DESIGN_SYSTEM.md`。

### 12.2 色板体系

| 色系 | 变量前缀 | 级数 | 用途 |
|------|---------|------|------|
| AOU 品牌色 | `--aou-1` ~ `--aou-10` | 10 级 | 品牌标识、渐变、装饰 |
| 背景色阶 | `--bg-0` ~ `--bg-10` | 11 级 | 页面背景、卡片、悬停、禁用 |
| 文字色阶 | `--text-primary` 等 | 4 级 | 主文字、次文字、提示、禁用 |
| 语义色 | `--primary` 等 | 5 种 | 主交互、成功、警告、危险、信息 |
| 品牌色 | `--brand` 等 | 3 种 | 品牌主色、浅色、悬停 |
| 成员色 | `mc-0` ~ `mc-7` | 8 色 | 成员身份区分 |

### 12.3 字体系统

```css
/* 正文字体栈 */
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
  'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;

/* 等宽字体栈 */
font-family: ui-monospace, "SF Mono", SFMono-Regular, Menlo, "Cascadia Code",
  "Roboto Mono", Consolas, monospace;
```

字号阶梯：9px / 10px / 11px / 12px / 13px（正文标准）/ 14px / 15px / 16px

### 12.4 间距系统

使用像素级精确间距（非 Tailwind 默认 4px 基数）：1px / 2px / 4px / 6px / 8px（标准间隔）/ 10px / 12px / 14px / 16px / 18px / 20px / 22px / 24px / 28px / 32px / 34px / 40px / 48px

### 12.5 圆角系统

| 圆角 | 用途 |
|------|------|
| 2px | 进度条 |
| 4px | 小标签、chip |
| 6px | 分段控件按钮、操作按钮 |
| 8px | 标准圆角 — 卡片、列容器、输入框 |
| 999px | 全圆 — 胶囊、头像、状态徽章 |

### 12.6 暗色模式

通过 `[data-theme='dark']` 属性切换，所有 CSS 变量在 Dark 选择器下重新赋值。`index.html` 中内置了暗色模式自动检测脚本，在页面加载前根据 `prefers-color-scheme` 设置 `data-theme` 属性，避免闪烁。

### 12.7 Tailwind CSS 映射

CSS 变量通过 `tailwind.config.js` 的 `theme.extend.colors` 映射到 Tailwind 类名。注意：由于 `bg-` 前缀冲突，组件中使用 `bg-[color:var(--bg-2)]` 的内联写法而非 `bg-2` 简写，确保 Tailwind JIT 正确编译。

---

## 13. 国际化

### 13.1 自动检测

```typescript
function detectLang(): Lang {
  const lang = navigator.language.toLowerCase();
  if (lang.startsWith('zh')) return 'zh';
  return 'en';
}
```

### 13.2 翻译函数

```typescript
import { t } from './i18n';

// 简单翻译
t('cli.title')  // → "同事团队面板" / "Colleague Team Panel"

// 带变量
t('cli.subtitle', { count: 3 })  // → "发现 3 个 CLI…" / "3 CLI(s) found…"
```

### 13.3 支持语言

| 语言 | 代码 | 检测条件 |
|------|------|----------|
| 简体中文 | `zh` | `navigator.language` 以 `zh` 开头 |
| English | `en` | 其他 |

手动切换：`setLang('en')` — 触发 `lang-change` 事件

---

## 14. 配置系统

### 14.1 团队配置 (`config/team.yaml`)

```yaml
team:
  name: "前端项目组"
  description: "负责前端开发的全栈团队"

members:
  - id: "leader-01"
    template: "./templates/orchestrator.yaml"
    name: "组长"
    model_family: "deepseek"
    acp_command: "claude"
    role: "leader"
    slot_id: 0

  - id: "coder-01"
    template: "./templates/coder.yaml"
    name: "码农"
    model_family: "deepseek"
    acp_command: "claude"
    role: "member"
    slot_id: 1
  # ... 审核员、测试员、文档员

workspace:
  path: "./workspace/"

memory:
  enabled: true
  individual_memory: true
  team_memory: true
  skill_memory: true

warmup:
  leader_first: true
  timeout: 30000

intervention:
  enabled: true
  actions: [pause, revise, takeover, skip]
```

### 14.2 模型族配置 (`config/model_families.yaml`)

```yaml
model_families:
  deepseek:
    current_version: "deepseek-v3"
    upgrade_to: "deepseek-v4"
    acp_command: "deepseek"

  gpt:
    current_version: "gpt-5.6"
    upgrade_to: "gpt-5.7"
    acp_command: "codex"

  claude:
    current_version: "claude-opus-4.5"
    acp_command: "claude"

  gemini:
    current_version: "gemini-2.5-pro"
    acp_command: "gemini"

  qwen:
    current_version: "qwen3-coder"
    acp_command: "qwen"

  local-ollama:
    current_version: "qwen2.5-coder"
    acp_command: "ollama"
```

绑定规则：每个同事绑定一个模型族（非版本），绑定后固定但版本可升级。

### 14.3 插件预设 (`config/preset.yml`)

```yaml
id: colleague
name: '同事插件'
version: '1.0.0'

dependencies:
  - '@deepseek-ai/dsh-subagent-acp'

agents:
  - id: colleague-leader
    preset: './templates/orchestrator.yaml'
  - id: colleague-coder
    preset: './templates/coder.yaml'
  # ...

webui:
  enabled: true
  entry: './web/team-panel/index.tsx'
  port: 3210

discovery:
  enabled: true
  scan_on_startup: true

memory:
  enabled: true
  levels: ['L0', 'L1', 'L2', 'L3']
  auto_distill: true
```

---

## 15. 技能与模板

### 15.1 模板系统 (`templates/`)

每个同事有一个 YAML 模板文件，定义其人设和工作指令：

| 模板 | 文件 | 核心内容 |
|------|------|----------|
| 组织者 | `orchestrator.yaml` | 决策 prompt、拆解规则、分派原则、流转决策 |
| 码农 | `coder.yaml` | 编码原则、完成报告格式、禁止事项 |
| 审核员 | `reviewer.yaml` | 审核维度（质量/安全/逻辑/性能/架构）、审核结果格式 |
| 测试员 | `tester.yaml` | 测试类型（单元/集成/边界/回归）、测试结果格式 |
| 文档员 | `doc-writer.yaml` | 文档类型（README/API/架构/注释/变更日志）、文档原则 |

### 15.2 模板结构

```yaml
name: "码农"
description: "负责编写代码、实现功能、修复 bug"
skill: "coding"
model_family: "deepseek"

team:
  role: "member"

subagent_provider: "acp"
acp_command: "claude"

agent_prompt: |
  你是团队的码农（Coder）。你的职责是：
  1. 接收组织者分派的任务
  2. 在共享工作区中编写代码
  3. 完成后将结果写回黑板
  ...

knowledge:
  source: "./knowledge/coding-standards/"
  type: "rag"
```

### 15.3 技能定义 (`skills/`)

每个技能有 `SKILL.md` 文件，定义工作流程和规范：

| 技能 | 文件 | 核心内容 |
|------|------|----------|
| 组织编排 | `skills/orchestrator/SKILL.md` | 任务拆解原则、分派匹配表、流转决策示例 |
| 编码 | `skills/coder/SKILL.md` | 功能实现流程、Bug 修复流程、产出物规范 |
| 审核 | `skills/reviewer/SKILL.md` | 审核维度、审核结果格式 |
| 测试 | `skills/tester/SKILL.md` | 测试类型、测试结果格式 |
| 文档 | `skills/doc-writer/SKILL.md` | 文档类型、文档原则 |

### 15.4 技能 Prompt 注入

同事执行任务时，技能 prompt 被注入到任务描述前面：

```typescript
const fullPrompt = config.skillPrompt
  ? `${config.skillPrompt}\n\n## 当前任务\n${taskDescription}`
  : taskDescription;
```

这样同事既知道"我是谁、我应该怎么做"（技能 prompt），又知道"现在要做什么"（任务描述）。

---

## 16. API 接口

### 16.1 接口列表

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/discover` | POST | 扫描已安装的 CLI，返回可用列表 |
| `/api/team/create` | POST | 用选定的 CLI 创建团队 |
| `/api/team/state` | POST | 获取黑板快照 + 消息 + 事件 |
| `/api/team/pause` | POST | 暂停团队 |
| `/api/team/resume` | POST | 恢复团队 |
| `/api/team/revise` | POST | 发送修正指令 |
| `/api/team/takeover` | POST | 用户接管 |
| `/api/team/skip` | POST | 跳过任务 |

### 16.2 请求/响应示例

**发现 CLI**

```bash
POST /api/discover
→ { agents: [...], available: [{ name: "Claude Code", command: "claude", ... }] }
```

**创建团队**

```bash
POST /api/team/create
Body: { cliCommand: "claude", goal: "做一个登录页面" }
→ { success: true, cliCommand: "claude" }
```

**获取状态**

```bash
POST /api/team/state
→ {
    snapshot: { team_id, tasks, member_states, artifacts, ... },
    messages: [{ id, from, to, type, content, ... }],
    events: [{ type: "task-assigned", taskId, assignee, ... }]
  }
```

**暂停/恢复/修正/接管/跳过**

```bash
POST /api/team/pause    → { success: true }
POST /api/team/resume   → { success: true }
POST /api/team/revise   Body: { message: "改用 React Hook" } → { success: true }
POST /api/team/takeover → { success: true }
POST /api/team/skip     Body: { taskId: "task-xxx" } → { success: true }
```

---

## 17. 开发指南

### 17.1 环境要求

| 依赖 | 版本 |
|------|------|
| Node.js | >= 20.0.0 |
| npm | 随 Node.js |
| 至少一个 ACP 兼容 CLI | Claude Code / Codex / Gemini CLI 等 |

### 17.2 安装

```bash
cd colleague-plugin
npm install
```

### 17.3 开发模式

```bash
# 方式 1：同时启动后端 + 前端
npm run dev:full

# 方式 2：分开启动
npm run server    # 后端 API Server (端口 8080)
npm run dev        # 前端 Vite Dev Server (端口 3210)
```

Vite 开发服务器配置了 `/api` 代理到 `http://localhost:8080`，前端和后端可独立开发。

### 17.4 构建

```bash
npm run build      # TypeScript 编译 + Vite 打包
npm run preview     # 预览生产构建
npm run type-check # 类型检查
```

### 17.5 配置 LLM

```bash
# 方式 1：环境变量
export LLM_API_KEY=sk-...
export LLM_BASE_URL=https://api.deepseek.com/v1
export LLM_MODEL=deepseek-chat

# 方式 2：DeepSeek 专用
export DEEPSEEK_API_KEY=sk-...

# 方式 3：不配置 — 自动 fallback 到 CLI 作为 LLM
```

### 17.6 配置工作区

```bash
# 默认工作区为当前目录
# 可以通过环境变量指定
export WORKSPACE=/path/to/project
```

### 17.7 技术栈

| 层 | 技术 |
|------|------|
| 前端框架 | React 18 + TypeScript 5.5 |
| 构建工具 | Vite 5.4 |
| 样式 | Tailwind CSS 3.4 + CSS 变量 |
| 后端 | Express 5 + tsx (TypeScript 执行) |
| 通信 | HTTP /api/* + JSON-RPC over stdio |
| CLI 集成 | ACP (Agent Client Protocol) |
| LLM 集成 | OpenAI 兼容 API |

---

## 18. 使用指南

### 18.1 快速开始

```bash
# 1. 安装至少一个 ACP 兼容 CLI（如 Claude Code）
npm install -g @anthropic-ai/claude-code

# 2. 启动服务
cd colleague-plugin
npm run dev:full

# 3. 打开浏览器
#    http://localhost:3210

# 4. 在 CLI 发现界面选择一个 CLI

# 5. 输入团队目标（如"做一个带表单验证的登录页"）

# 6. 点击"启动团队"

# 7. 观察团队面板，随时介入
```

### 18.2 典型使用场景

**场景 1：前端功能开发**

```
目标："做一个带表单验证和错误提示的登录页"

组织者拆解：
  → 码农：实现登录组件（用户名/密码输入 + 验证逻辑）
  → 审核员：Review 代码质量和安全性
  → 测试员：编写登录功能单元测试
  → 文档员：编写 README
```

**场景 2：Bug 修复**

```
目标："修复登录页空指针 bug"

组织者拆解：
  → 码农：定位并修复空指针
  → 审核员：Review 修复
  → 测试员：回归测试
```

**场景 3：重构**

```
目标："把 Class 组件改成 Hooks"

组织者拆解：
  → 码农：逐个组件改写
  → 审核员：Review 每个 PR
  → 测试员：确保不引入回归
  → 文档员：更新文档
```

### 18.3 介入操作

| 操作 | 按钮 | 效果 |
|------|------|------|
| 暂停 | 底部栏 [暂停] | 决策循环暂停，等待恢复 |
| 恢复 | 底部栏 [恢复] | 决策循环继续 |
| 修正 | 底部栏 [修正] → 输入框 | Leader 接收修正指令，重新规划 |
| 接管 | 底部栏 [接管] | Leader 暂停，等待用户手动操作 |
| 跳过 | 底部栏 [跳过] | 取消当前任务 |

### 18.4 成员管理

| 操作 | 方式 |
|------|------|
| 添加成员 | 点击成员栏右侧"添加成员" |
| 重命名成员 | 双击成员胶囊 → 输入新名称 |
| 移除成员 | hover 成员胶囊 → 点击关闭按钮（Leader 不可移除）|

---

## 19. 项目结构

```
colleague-plugin/
├── index.html                    # HTML 入口（暗色模式检测脚本）
├── index.ts                      # 程序化 API 入口（createTeam 等）
├── package.json                  # 依赖与脚本
├── vite.config.ts                # Vite 配置（别名 + API 代理）
├── tailwind.config.js            # Tailwind 主题扩展
├── postcss.config.js             # PostCSS 配置
├── tsconfig.json                 # TypeScript 配置
│
├── config/                       # 配置文件
│   ├── team.yaml                 # 团队配置（成员、工作区、记忆、介入）
│   ├── preset.yml                # dsh 插件预设
│   └── model_families.yaml       # 模型族绑定配置
│
├── core/                         # 核心引擎
│   ├── acp/
│   │   └── session-manager.ts    # ACP 会话管理（JSON-RPC + 流式）
│   ├── blackboard/
│   │   ├── store.ts              # 黑板实现（共享状态空间）
│   │   └── types.ts              # 类型定义（Task, MemberState 等）
│   ├── discovery/
│   │   └── agent-discovery.ts    # Agent 自动发现（PATH 扫描 + ACP 握手）
│   ├── llm/
│   │   └── provider.ts           # OpenAI 兼容 LLM Provider
│   ├── mailbox/
│   │   ├── store.ts              # Mailbox 实现（通信管道）
│   │   └── types.ts              # 消息类型定义
│   └── orchestrator/
│       └── engine.ts             # 编排引擎（Leader 决策 + 黑板 + mailbox）
│
├── memory/
│   └── types.ts                  # 四层记忆架构类型定义
│
├── server/
│   └── index.ts                  # Express API Server
│
├── skills/                       # 技能定义
│   ├── coder/SKILL.md
│   ├── orchestrator/SKILL.md
│   ├── reviewer/SKILL.md
│   ├── tester/SKILL.md
│   └── doc-writer/SKILL.md
│
├── templates/                    # 同事模板
│   ├── coder.yaml
│   ├── orchestrator.yaml
│   ├── reviewer.yaml
│   ├── tester.yaml
│   └── doc-writer.yaml
│
├── web/                          # Web UI
│   ├── index.css                # CSS 变量 + 全局样式 + 动画
│   ├── main.tsx                 # React 入口（CLI 发现 + 团队面板）
│   └── team-panel/
│       ├── index.tsx            # TeamPage 主页面
│       ├── i18n/
│       │   └── index.ts         # 国际化系统
│       ├── identity/
│       │   └── member-colors.ts  # 成员身份色板
│       ├── components/           # UI 组件（9 个）
│       │   ├── ActivityBoardLayout.tsx
│       │   ├── ActivityControlBar.tsx
│       │   ├── AgentStatusBadge.tsx
│       │   ├── InterventionBar.tsx
│       │   ├── MessageCard.tsx
│       │   ├── TaskCard.tsx
│       │   ├── TeamTabs.tsx
│       │   ├── TeamWarmupOverlay.tsx
│       │   └── ViewToggle.tsx
│       └── hooks/               # React Hooks（6 个）
│           ├── activityTime.ts
│           ├── activityTypes.ts
│           ├── useIsClamped.ts
│           ├── useTeamActivityControls.ts
│           ├── useTeamActivityFeed.ts
│           ├── useTeamMemberColors.ts
│           ├── useTeamViewMode.ts
│           └── useTeamWarmup.ts
│
├── docs/                         # 文档
│   ├── ARCHITECTURE.md          # 架构文档
│   ├── DESIGN_SYSTEM.md         # 设计系统规范
│   └── PRODUCT.md               # 本文件
│
└── dist/                         # 构建产物
    ├── index.html
    └── assets/
```

---

## 20. 路线图

### 20.1 已完成 (v1.0)

- [x] Agent 自动发现（20+ CLI）
- [x] ACP 协议会话管理
- [x] 编排引擎（Leader 动态决策）
- [x] 黑板 + Mailbox 双模块
- [x] 5 个角色化同事（组织者/码农/审核员/测试员/文档员）
- [x] Web UI 团队面板（照搬 AionUi 设计）
- [x] 暗色模式自动检测
- [x] 中英文国际化
- [x] 用户介入（暂停/恢复/修正/接管/跳过）
- [x] 成员身份色系统
- [x] Warmup 初始化遮罩
- [x] LLM 集成（OpenAI 兼容 + CLI fallback）
- [x] Express API Server
- [x] 配置系统（team.yaml / model_families.yaml / preset.yml）
- [x] 技能与模板系统
- [x] 四层记忆类型定义

### 20.2 计划中

- [ ] 记忆系统实现（L0→L1→L2→L3 蒸馏管道）
- [ ] 成员间直接交接（Leader 授权后同事直接通信）
- [ ] 多 CLI 混合团队（不同成员用不同 CLI）
- [ ] 实时流式输出在 UI 中展示
- [ ] 产出物文件预览
- [ ] 团队历史回放
- [ ] 自定义同事角色（用户定义新技能）
- [ ] MCP 工具集成
- [ ] 更多语言支持（日语、韩语等）
- [ ] 插件市场发布

---

## 附录

### A. 事件类型

编排引擎通过 `engine.on(event, callback)` 订阅事件：

| 事件 | 触发时机 |
|------|----------|
| `members-initialized` | 成员初始化完成 |
| `goal-started` | 用户目标开始执行 |
| `goal-decomposed` | Leader 完成目标拆解 |
| `task-assigned` | 任务被分派给同事 |
| `task-completed` | 同事完成任务 |
| `task-failed` | 同事任务失败 |
| `goal-completed` | 全部完成，Leader 汇报 |
| `plan-revised` | 计划被修正 |
| `plan-revising` | 正在修正计划 |
| `paused` | 团队暂停 |
| `resumed` | 团队恢复 |
| `task-skipped` | 任务被跳过 |
| `user-takeover` | 用户接管 |
| `colleague-started` | 同事开始执行任务 |
| `colleague-stream` | 同事流式输出 |

### B. 消息类型

Mailbox 中的消息类型：

| 类型 | 方向 | 说明 |
|------|------|------|
| `task_assign` | Leader → 同事 | 分派任务 |
| `task_complete` | 同事 → Leader | 任务完成 |
| `task_fail` | 同事 → Leader | 任务失败 |
| `review_feedback` | 审核员 → 码农 | 审核反馈 |
| `test_result` | 测试员 → Leader | 测试结果 |
| `user_intervention` | 用户 → Leader | 介入指令 |
| `broadcast` | 任意 → 所有人 | 广播消息 |
| `query` | 同事 → Leader | 提问 |
| `response` | Leader → 同事 | 回答 |

### C. 任务状态

| 状态 | 颜色 | 说明 |
|------|------|------|
| `pending` | `var(--bg-6)` 灰 | 待处理 |
| `in_progress` | `var(--primary)` 蓝 | 进行中 |
| `completed` | `var(--success)` 绿 | 已完成 |
| `failed` | `var(--danger)` 红 | 失败 |
| `cancelled` | `var(--danger)` 红 | 已取消 |

### D. 许可证

MIT License — 可自由使用、修改、分发。