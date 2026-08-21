# Skill: Orchestration (组织/编排)

> 组织者（Leader）的核心技能 — 负责任务拆解、分派、流转决策

## 能力定义

```yaml
skill_id: orchestration
name: "组织编排"
description: "理解用户目标，拆解为子任务，分派给团队成员，动态决策流转"
category: management
complexity: high
```

## 核心能力

### 1. 任务拆解

将用户的高层目标拆解为可执行的子任务：

```
用户："做一个登录页面"
    │
    ▼
Leader 拆解：
  ├── [码农] 实现登录页面 UI 组件
  ├── [码农] 实现登录 API 接口
  ├── [审核员] Review 登录模块代码
  ├── [测试员] 编写登录功能测试
  └── [文档员] 编写登录模块文档
```

拆解原则：
- 每个子任务要能被一个同事独立完成
- 子任务之间可以有依赖，但不要循环依赖
- 子任务的粒度不要太细（"写一个函数"太细）也不要太粗（"实现整个系统"太粗）

### 2. 任务分派

根据同事技能匹配分派任务：

| 子任务类型 | 分派给 |
|-----------|--------|
| 写代码/改 bug | 码农 |
| Code review | 审核员 |
| 写测试/跑测试 | 测试员 |
| 写文档 | 文档员 |

### 3. 流转决策

Leader 看黑板状态，**动态决策**（不按固定流程）：

```
看到：码农完成了 Login.tsx
决策：让审核员 review
    ↓
看到：审核员说"有空指针风险"
决策：退回给码农修
    ↓
看到：码农修复了
决策：让审核员复看
    ↓
看到：审核通过
决策：让测试员测
    ↓
看到：测试全过
决策：让文档员补文档
    ↓
看到：文档完成
决策：汇报用户，全部完成
```

## 决策示例

### 场景 1：正常流程

```json
// 黑板状态
{
  "tasks": [
    { "id": "t1", "title": "实现登录UI", "assignee": "码农", "status": "completed" },
    { "id": "t2", "title": "Review登录模块", "assignee": "审核员", "status": "pending" }
  ],
  "member_states": {
    "码农": { "status": "idle" },
    "审核员": { "status": "idle" }
  }
}

// Leader 决策
{
  "action": "assign",
  "task": { "id": "t2", "title": "Review登录模块", "assignee": "审核员" },
  "reason": "码农完成了登录UI，下一步让审核员 review"
}
```

### 场景 2：审核退回

```json
// 黑板状态
{
  "tasks": [
    { "id": "t2", "title": "Review登录模块", "assignee": "审核员", "status": "completed", "result": "changes_requested: 空指针风险" }
  ],
  "member_states": {
    "码农": { "status": "idle" }
  }
}

// Leader 决策
{
  "action": "assign",
  "task": { "id": "t3", "title": "修复空指针风险", "assignee": "码农", "description": "审核员发现 Login.tsx 第42行空指针风险，添加空值检查" },
  "reason": "审核发现问题，退回给码农修复"
}
```

### 场景 3：用户介入

```json
// 用户说："跳过测试"
// Leader 决策
{
  "action": "revise",
  "reason": "用户要求跳过测试，取消测试相关任务",
  "revised_plan": "码农完成 → 审核通过 → 直接文档 → 汇报完成"
}
```
