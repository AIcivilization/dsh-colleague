# 架构设计文档

## 1. 总体架构

### 1.1 分层架构

```
┌──────────────────────────────────────────────────────────┐
│  用户交互层 (Web UI)                                      │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 团队面板（完全模仿 AionUi Team Mode）              │   │
│  │  - 顶部成员栏 + 状态指示灯                         │   │
│  │  - 活动看板（TaskCard + MessageCard）              │   │
│  │  - 控制栏（筛选/排序）                             │   │
│  │  - 视图切换（并行/单聊）                           │   │
│  │  - Warmup 初始化遮罩                               │   │
│  │  - 介入控制栏（差异化：暂停/修正/接管/跳过）        │   │
│  └──────────────────────────────────────────────────┘   │
├──────────────────────────────────────────────────────────┤
│  编排引擎层                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Leader    │  │ 黑板      │  │ mailbox   │              │
│  │ (动态决策) │  │ (共享状态) │  │ (消息路由) │              │
│  └──────────┘  └──────────┘  └──────────┘              │
│  ┌──────────┐  ┌──────────┐                            │
│  │ 知识库    │  │ 模型管理   │                            │
│  │ (RAG)     │  │ (模型族)   │                            │
│  └──────────┘  └──────────┘                            │
├──────────────────────────────────────────────────────────┤
│  适配层                                                   │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐           │
│  │ ACP Adapter│ │ Codex Adapter│ │ Claude Adapter│        │
│  │ (通用协议)  │ │ (CLI 子进程) │ │ (CLI 子进程)  │        │
│  └────────────┘ └────────────┘ └────────────┘           │
├──────────────────────────────────────────────────────────┤
│  dsh 基础设施                                             │
│  subagent-acp | subagent-codex | subagent-claude-code    │
└──────────────────────────────────────────────────────────┘
```

### 1.2 核心设计决策

1. **CLI 驱动 + 完整能力**：每个同事是一个完整的 CLI agent 子进程，不是"API 调用 + system prompt"
2. **ACP 协议接入**：通过 dsh 的 `subagent-acp` provider，支持任何 ACP 兼容的 CLI agent
3. **Leader 动态决策**：不预定义流转规则，Leader 看黑板状态自己决定下一步
4. **完全模仿 AionUi UI**：组件结构、交互模式、视觉设计 1:1 对标
5. **差异化在响应栏目**：介入控制栏、角色模板、记忆指示、模型族标签

## 2. 同事定义文件格式

### 2.1 四层结构

```yaml
# colleague.yaml — 同事定义文件

# ===== 第一层：基础属性（员工本人）=====
name: "老王"
model_family: "deepseek"          # 绑定的模型族（可跨版本升级）
# model_family: "gpt"
# model_family: "claude"
# model_family: "local-ollama"

# ===== 第二层：技能属性（擅长干什么）=====
skills:
  - coding                         # 写代码
  # - review                      # 审核
  # - orchestration               # 组织
  # - testing                     # 测试
  # - docs                        # 文档

# ===== 第三层：知识属性（领域知识 / RAG）=====
knowledge:
  source: "./knowledge/前端规范/"  # 本地知识库路径
  # source: "git::repo::path"     # 或从 git 仓库拉
  type: "rag"                      # 初期统一用 RAG

# ===== 第四层：团队属性（在哪个组、什么角色）=====
team:
  name: "前端项目组"
  role: "member"                   # member / leader

# ===== ACP 配置 =====
subagent_provider: "acp"           # 使用 ACP 通用协议
acp_command: "claude"              # 要启动的 CLI agent 命令
# acp_command: "codex"
# acp_command: "gemini"
# acp_command: "qwen"
```

### 2.2 组织者（Leader）的特殊属性

```yaml
# colleague.yaml — 组织者
name: "组长"
model_family: "deepseek"
skills:
  - orchestration
team:
  name: "前端项目组"
  role: "leader"

subagent_provider: "acp"
acp_command: "claude"

# 组织者额外配置
leader_config:
  decision_prompt: |
    你是团队的组织者。你要看黑板上的当前状态，自己决定下一步该让谁干什么。
    不要按固定流程走，要根据当前情况动态决策。
  max_concurrent_tasks: 5          # 最多同时分派几个任务
  auto_review_threshold: 0.8       # 自动触发 review 的置信度阈值
```

## 3. 编排引擎：Leader + 黑板 + mailbox

### 3.1 Leader 的职责

```
Leader 做三件事：
  1. 拆解：用户说"做一个登录页面" → 拆成子任务
  2. 分派：把子任务交给对应同事
  3. 流转决策：有人完成后，看黑板状态决定下一步给谁

Leader 不做：
  - 直接执行任务（那是同事的事）
  - 存储工作成果（那是黑板的事）
  - 传递消息（那是 mailbox 的事）
```

### 3.2 黑板状态格式

```typescript
interface Blackboard {
  team_id: string;
  tasks: Task[];
  artifacts: Artifact[];
  member_states: Record<string, MemberState>;
  context_handoffs: ContextHandoff[];
}

interface Task {
  id: string;
  title: string;
  description: string;
  assignee: string;           // 被分派的同事 ID
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  created_at: number;
  updated_at: number;
  dependencies?: string[];    // 依赖的其他任务 ID
  result?: string;            // 完成后的结果摘要
}

interface Artifact {
  id: string;
  task_id: string;
  author: string;             // 创建者同事 ID
  type: 'code' | 'review' | 'test' | 'doc';
  content: string;            // 文件路径或内容摘要
  created_at: number;
}

interface MemberState {
  colleague_id: string;
  status: 'pending' | 'idle' | 'active' | 'completed' | 'failed' | 'dormant';
  current_task_id?: string;
  last_activity_at: number;
}

interface ContextHandoff {
  from: string;               // 发送者同事 ID
  to: string;                 // 接收者同事 ID
  task_id: string;
  message: string;
  attachments?: string[];     // 文件路径列表
  created_at: number;
}
```

### 3.3 mailbox 消息格式

```typescript
interface MailboxMessage {
  id: string;
  from: string;               // 发送者 ID（同事 ID 或 "user" 或 "leader"）
  to: string;                 // 接收者 ID
  type: 'task_assign' | 'task_complete' | 'task_fail' | 'review_feedback' | 'user_intervention' | 'broadcast';
  content: string;
  attachments?: string[];
  broadcast?: boolean;        // 是否广播给所有人
  created_at: number;
}
```

### 3.4 Leader 决策循环

```typescript
// 伪代码
async function leaderDecisionLoop(blackboard: Blackboard, mailbox: Mailbox) {
  while (!allTasksDone(blackboard)) {
    // 1. 看黑板当前状态
    const state = readBlackboard(blackboard);

    // 2. 用 LLM 决策下一步
    const decision = await llmDecide({
      prompt: leaderConfig.decision_prompt,
      context: {
        tasks: state.tasks,
        member_states: state.member_states,
        recent_handoffs: state.context_handoffs.slice(-5),
      },
    });

    // 3. 根据 decision 执行
    if (decision.action === 'assign') {
      const msg = createTaskAssignMessage(decision.task, decision.assignee);
      mailbox.send(decision.assignee, msg);
      blackboard.updateTaskStatus(decision.task.id, 'in_progress');
    } else if (decision.action === 'wait') {
      await waitForMemberComplete(mailbox);
    } else if (decision.action === 'report') {
      reportToUser(decision.summary);
      break;
    }
  }
}
```

## 4. Agent 自动发现层

参考 AionUi 的 `binaryResolver.ts` 实现：

```typescript
// core/discovery/agent-discovery.ts

interface DiscoveredAgent {
  name: string;               // "Claude Code" / "Codex" / "Gemini CLI"
  command: string;            // "claude" / "codex" / "gemini"
  path: string;               // 可执行文件路径
  capabilities?: AgentCapabilities;  // ACP 握手后获得
  available: boolean;          // 是否可用
}

interface AgentCapabilities {
  tools: string[];            // 支持的工具列表
  depth: number;              // 最大递归深度
  structured_output: boolean;  // 是否支持结构化输出
  yolo_mode: boolean;         // 是否支持无人值守
}

async function discoverAgents(): Promise<DiscoveredAgent[]> {
  // 1. 扫描 PATH 中已知的 ACP 兼容 CLI
  const knownAgents = [
    { name: 'Claude Code', command: 'claude' },
    { name: 'Codex', command: 'codex' },
    { name: 'Gemini CLI', command: 'gemini' },
    { name: 'Qwen Code', command: 'qwen' },
    { name: 'Goose', command: 'goose' },
    { name: 'Kimi CLI', command: 'kimi' },
    // ... 更多
  ];

  const discovered: DiscoveredAgent[] = [];

  for (const agent of knownAgents) {
    const path = await resolveBinary(agent.command);
    if (path) {
      // 2. 对每个找到的 agent 做 ACP 握手
      const capabilities = await acpHandshake(agent.command);
      discovered.push({
        ...agent,
        path,
        capabilities,
        available: true,
      });
    }
  }

  return discovered;
}
```

## 5. Web UI 团队面板：完全模仿 AionUi

### 5.1 五层界面结构

```
┌─────────────────────────────────────────────────────┐
│  控制栏：[最新/最旧] [全部/消息/任务] [成员筛选▼]      │  ← ActivityControlBar
├──────────┬──────────┬──────────┬──────────┬─────────┤
│ 组织者    │ 码农     │ 审核员    │ 测试员    │ 文档员   │  ← TeamTabs (成员栏)
│ ●绿(活跃) │ ●绿(活跃) │ ●灰(空闲)  │ ●灰(空闲)  │ ●灰(空闲) │  ← AgentStatusBadge
├──────────┼──────────┼──────────┼──────────┼─────────┤
│          │          │          │          │         │
│ TaskCard │ TaskCard │          │          │         │  ← TaskCard
│ "拆解:   │ "实现登录│          │          │         │
│  登录页面"│  组件"   │          │          │         │
│ → 蓝(进行)│ → 绿(完成)│          │          │         │
│          │          │          │          │         │
│ MsgCard  │ MsgCard  │          │          │         │  ← MessageCard
│ "码农,   │ "完成了  │          │          │         │
│  去实现   │  Login"  │          │          │         │
│  登录"   │          │          │          │         │
│          │          │          │          │         │
│ MsgCard  │          │          │          │         │
│ "审核员, │          │          │          │         │
│  去review"          │          │          │         │
│          │          │          │          │         │
├──────────┴──────────┴──────────┴──────────┴─────────┤
│  [暂停] [修正] [接管] [跳过]          介入控制栏      │  ← InterventionBar (差异化)
└─────────────────────────────────────────────────────┘
```

### 5.2 组件清单

| 组件 | AionUi 对应 | 说明 |
|------|-------------|------|
| `TeamPage` | `TeamPage.tsx` | 团队面板入口 |
| `TeamTabs` | `TeamTabs.tsx` | 顶部成员栏，每个成员显示为横向胶囊 |
| `AgentStatusBadge` | `AgentStatusBadge.tsx` | 状态指示灯，右下角小圆点 |
| `ActivityBoardLayout` | `ActivityBoardLayout.tsx` | 活动看板，多列布局 |
| `TaskCard` | `TaskCard.tsx` | 任务卡片 |
| `MessageCard` | `MessageCard.tsx` | 消息卡片 |
| `ActivityControlBar` | `ActivityControlBar.tsx` | 筛选和排序控制 |
| `TeamViewToggle` | `TeamViewToggle.tsx` | 并行/单聊视图切换 |
| `TeamWarmupOverlay` | `TeamWarmupOverlay.tsx` | 初始化遮罩 |
| `teamMemberColors` | `teamMemberColors.ts` | 身份色系统 |
| `InterventionBar` | — (差异化新增) | 介入控制栏 |

### 5.3 身份色系统

每个成员实例有固定颜色，绑死在 slot_id 上，不会因为增删其他成员而变：

```typescript
// web/team-panel/identity/member-colors.ts

const TEAM_MEMBER_COLORS = [
  '#6366f1',  // indigo-500   — slot 0 (Leader)
  '#ec4899',  // pink-500      — slot 1
  '#f59e0b',  // amber-500     — slot 2
  '#10b981',  // emerald-500   — slot 3
  '#3b82f6',  // blue-500      — slot 4
  '#8b5cf6',  // violet-500    — slot 5
  '#ef4444',  // red-500       — slot 6
  '#14b8a6',  // teal-500      — slot 7
];

export function getMemberColor(slotId: number): string {
  return TEAM_MEMBER_COLORS[slotId % TEAM_MEMBER_COLORS.length];
}
```

### 5.4 状态指示灯

| 状态 | 颜色 | 动画 | 含义 |
|------|------|------|------|
| `pending` | 灰色 (`bg-gray-400`) | 无 | 等待启动 |
| `idle` | 灰色 (`bg-gray-400`) | 无 | 空闲 |
| `active` | 绿色 (`bg-green-500`) | 脉动 (`animate-pulse`) | 正在工作 |
| `completed` | 灰色 (`bg-gray-400`) | 无 | 已完成 |
| `failed` | 红色 (`bg-red-500`) | 无 | 失败 |
| `dormant` | 空心灰圈 (`border-gray-400`) | 无 | 从未被唤醒 |

### 5.5 TaskCard 设计

```
┌──────────────────────────────┐
│ ●蓝  实现登录组件              │  ← 状态色 + 标题
│      pending → in_progress    │
├──────────────────────────────┤
│ 实现 Login.tsx 组件，包含      │  ← 描述（可展开/折叠）
│ 用户名密码输入和提交按钮       │
├──────────────────────────────┤
│ ⛓ blocked by: 实现API路由     │  ← 依赖关系（可点击跳转）
├──────────────────────────────┤
│ 14:32                         │  ← 时间戳
└──────────────────────────────┘
```

任务状态颜色：
- `pending` → 灰色
- `in_progress` → 蓝色
- `completed` → 绿色
- `deleted` → 红色

### 5.6 MessageCard 设计

```
┌──────────────────────────────┐
│ ●indigo → ●pink              │  ← 发件人 → 收件人（身份色圆点）
│ 码农, 去实现登录页面           │  ← 消息内容
├──────────────────────────────┤
│ 📎 2 个附件                   │  ← 附件标记（有附件时）
├──────────────────────────────┤
│ 📢 Broadcast to all           │  ← 广播标记（广播消息时）
├──────────────────────────────┤
│ 14:30                         │  ← 时间戳
└──────────────────────────────┘
```

### 5.7 Warmup 初始化遮罩

进入团队时：
- 全界面磨砂遮罩 (`backdrop-blur`)
- 成员头像从左到右逐个"点亮"（Leader 先亮）
- "唤醒中 N/M" 文案
- 品牌色进度条
- **Leader 就绪即撤遮罩**（不等全部成员）
- 失败：该成员胶囊显示"启动失败 · 可重试"
- 超时：遮罩转错误态

### 5.8 视图切换

- **并行视图**：所有成员列并排展示（默认）
- **单聊视图**：全屏显示当前选中的成员
- 按团队记忆（localStorage，`team-view-mode-${team_id}`）

### 5.9 差异化：介入控制栏

这是 AionUi 没有的部分，放在面板底部响应栏目中：

```
├──────────────────────────────────────────────────────────┤
│  [⏸ 暂停] [✏ 修正] [👤 接管] [⏭ 跳过]     介入控制栏    │
└──────────────────────────────────────────────────────────┘
```

| 按钮 | 功能 |
|------|------|
| **暂停** | Leader 停止派发新任务，等当前在跑的同事完成 |
| **修正** | 用户输入修正指令，Leader 调整后续计划 |
| **接管** | Leader 等用户干完，再继续 |
| **跳过** | 跳过当前步骤（如跳过测试） |

## 6. 记忆系统

### 6.1 四层记忆架构

```
┌────────────┬────────────┬────────────┬──────────┐
│ 个人记忆    │ 跨人记忆    │ 团队记忆    │ 技能记忆  │
│ (per-      │ (cross-    │ (team      │ (skill   │
│ colleague) │ colleague) │ memory)    │ memory)  │
│            │            │            │          │
│ 个人偏好    │ 协作历史    │ 团队规范    │ 可复用    │
│ 工作习惯    │ 交接记录    │ 架构决策    │ skill    │
│ 常见错误    │ 冲突记录    │ 项目上下文  │ 模式      │
└────────────┴────────────┴────────────┴──────────┘
```

### 6.2 记忆注入策略

不是每次都全量注入（避免 token 爆炸），而是：
- **个人记忆**：按需检索，只注入和当前任务相关的记忆片段
- **团队记忆**：Leader 始终持有，同事按需查询
- **技能记忆**：任务匹配时自动加载对应 skill

## 7. 模型族绑定

```yaml
# model_families.yaml
model_families:
  deepseek:
    current_version: "deepseek-v3"
    upgrade_to: "deepseek-v4"    # 版本可升级
    acp_command: "deepseek"
    
  gpt:
    current_version: "gpt-5.6"
    upgrade_to: "gpt-5.7"
    acp_command: "codex"
    
  claude:
    current_version: "claude-opus-4.5"
    acp_command: "claude"
    
  local-ollama:
    current_version: "qwen2.5-coder"
    acp_command: "ollama"
```

**绑定规则**：绑定模型族，版本可升级。比如绑定 gpt5.6，期间 gpt 升级了，可以换成 gpt5.7。
