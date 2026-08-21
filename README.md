# 同事插件 (Colleague Plugin)

> 有记忆、有角色的长期 AI 团队 — 基于 dsh (DeepSeek Harness) 的多 agent 协作插件

## 核心理念

**一个同事 = CLI 驱动的完整 agent + 技能定义 + 知识库 + 连续记忆**

不像 AionUi 做的是"通用多 agent 并行平台"，这个插件做的是"有记忆、有角色的长期团队"——同事之间有协作历史、有沉淀的技能、有冷启动加载的团队记忆。

## 架构概览

```
┌──────────────────────────────────────────────────────────┐
│              「同事」插件                                  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 同事模板层 (templates/)                          │   │
│  │  orchestrator | coder | reviewer | tester | docs  │   │
│  │  每个模板: name + skill + model_family + acp_cmd   │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Agent 自动发现层 (core/discovery/)               │   │
│  │  扫描 PATH 中的 ACP 兼容 CLI → 握手 → 列出可用    │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 编排引擎 (core/orchestrator/)                    │   │
│  │  Leader + 黑板 + mailbox 三合一                   │   │
│  │  Leader 动态决策（非预定义流转规则）               │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Web UI 团队面板 (web/team-panel/)                │   │
│  │  完全模仿 AionUi Team Mode 设计                    │   │
│  │  差异化部分在响应栏目                              │   │
│  └──────────────────────────────────────────────────┘   │
├──────────────────────────────────────────────────────────┤
│                  dsh 基础设施                             │
│  subagent-acp | subagent-codex | subagent-claude-code    │
└──────────────────────────────────────────────────────────┘
```

## 五大类同事

| 类别 | 技能 | 干什么 | 定位 |
|------|------|--------|------|
| **组织者** | `orchestration` | 拆解任务、分派给同事、收集结果、决策流转 | 团队的大脑 |
| **码农** | `coding` | 写代码、改 bug、实现功能 | 核心生产力 |
| **审核员** | `review` | code review、安全审计、质量把关 | 质量守门员 |
| **测试员** | `testing` | 写测试、跑测试、验证结果 | 验证闭环 |
| **文档员** | `docs` | 写文档、补注释、生成 README | 知识沉淀 |

## 编排模式：Leader + 黑板 + mailbox

```
Leader 是大脑：看到全局状态，动态决策下一步给谁
黑板是共享状态：所有人都能看、都能写
mailbox 是通信管道：Leader 和同事之间传递消息

没有预定义流转规则。Leader 根据黑板上的当前状态，自己决定下一步。
```

### 工作流程

```
用户："做一个登录页面"
    │
    ▼
Leader 看黑板（空的）
    ├── 拆解："码农，你去实现登录页面"
    │   → mailbox 发消息给码农
    │
码农干活，写回黑板（"Login.tsx 完成了"）
    │
    ├── Leader 看黑板（码农完成了）
    │   ├── Leader 自己判断："下一步该让审核员看"
    │   → mailbox 发消息给审核员
    │
审核员干活，写回黑板（"有空指针风险"）
    │
    ├── Leader 看黑板（审核发现问题）
    │   ├── Leader 自己判断："退回码农修"
    │   → mailbox 发消息给码农
    │
... 如此循环 ...
    │
    ├── Leader 看黑板（全部完成）
    │   ├── 汇报用户："全部完成"
```

## 与 AionUi 的差异

| 维度 | AionUi Team Mode | 本插件 |
|------|-------------------|--------|
| **宿主** | 独立桌面应用 | dsh 插件（WebUI 第 5 模式） |
| **agent 接入** | ACP 自动发现 | dsh subagent-acp + subagent-codex/claude-code |
| **角色定义** | 无预设角色，临时选助手 | 五大类预设（组织者/码农/审核员/测试员/文档员） |
| **记忆** | 无跨会话记忆 | 腾讯 Agent Memory（L0-L3 蒸馏 + 团队记忆） |
| **编排** | Leader 拆解 + mailbox | Leader + 黑板 + mailbox（Leader 动态决策） |
| **用户介入** | 权限确认弹窗 | 暂停/打断/修正/接管（介入控制栏） |
| **skill 沉淀** | 无 | 从工作中提取可复用 skill |
| **冷启动** | 无 | 新同事加载团队已有记忆 |

## Web UI：完全模仿 AionUi

团队面板组件结构（1:1 对标 AionUi）：

```
web/team-panel/
├── index.tsx                  # 团队面板入口 (参考 TeamPage)
├── member-tabs.tsx            # 顶部成员栏 (参考 TeamTabs)
├── agent-status-badge.tsx     # 状态指示灯 (参考 AgentStatusBadge)
├── activity-board.tsx         # 活动看板 (参考 ActivityBoardLayout)
├── task-card.tsx              # 任务卡片 (参考 TaskCard)
├── message-card.tsx           # 消息卡片 (参考 MessageCard)
├── control-bar.tsx            # 筛选排序栏 (参考 ActivityControlBar)
├── view-toggle.tsx            # 并行/单聊切换 (参考 TeamViewToggle)
├── warmup-overlay.tsx         # 初始化遮罩 (参考 TeamWarmupOverlay)
├── intervention-bar.tsx       # 介入控制栏 (差异化新增)
└── identity/
    └── member-colors.ts       # 身份色系统 (参考 teamMemberColors)
```

### 状态指示灯

| 状态 | 颜色 | 含义 |
|------|------|------|
| `pending` | 灰色 | 等待启动 |
| `idle` | 灰色 | 空闲 |
| `active` | 绿色 + 脉动动画 | 正在工作 |
| `completed` | 灰色 | 已完成 |
| `failed` | 红色 | 失败 |
| `dormant` | 空心灰圈 | 从未被唤醒 |

## 开发计划

| Phase | 内容 | 预估 |
|-------|------|------|
| **P0** | 骨架 + preset 配置 | 2 天 |
| **P1** | 五大类 skill 文件 | 3 天 |
| **P2** | 模板含 `subagent_provider: acp` + `acp_command` | 1 天 |
| **P2.5** | Agent 自动发现（参考 AionUi binaryResolver） | 1-2 天 |
| **P3** | 编排引擎（Leader + 黑板 + mailbox） | 5 天 |
| **P4** | Web UI 团队面板（完全模仿 AionUi） | 5 天 |
| **P5** | 模型族绑定 | 2 天 |
| **P6** | 记忆适配（腾讯 Agent Memory） | 3 天 |
| **P7** | 开源 | 1 天 |

**总计约 3.5-4.5 周**

## License

MIT
