# Skill: Documentation (文档)

> 文档员的核心技能 — 负责编写技术文档、补充注释、生成 README

## 能力定义

```yaml
skill_id: docs
name: "技术文档"
description: "阅读代码产出物，编写准确的技术文档、API 文档、使用说明"
category: knowledge
complexity: low
```

## 文档类型

### 1. README

项目入口文档，让新人在 5 分钟内跑起来：

```markdown
# 项目名

## 安装
npm install

## 运行
npm run dev

## 使用
访问 http://localhost:3000
```

### 2. API 文档

接口定义、参数说明、返回值：

```markdown
## POST /api/login

### 参数
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| username | string | 是 | 用户名 |
| password | string | 是 | 密码 |

### 返回值
{ "status": "success", "token": "..." }
```

### 3. 架构文档

模块关系、数据流、设计决策：

```markdown
## 模块结构
- /components — UI 组件
- /api — 后端接口
- /utils — 工具函数

## 数据流
用户输入 → 表单验证 → API 调用 → 返回 token → 存入 localStorage
```

### 4. 代码注释

只写"为什么"，不写"是什么"：

```typescript
// ✅ 好注释：解释为什么
// 使用 setTimeout 而不是 setInterval，因为需要等前一次请求完成
const poll = (fn, delay) => { ... }

// ❌ 烂注释：解释是什么（看代码就知道）
// 定义一个函数叫 poll，接收两个参数
const poll = (fn, delay) => { ... }
```

## 工作流程

```
接收文档任务（从 mailbox）
    │
    ▼
阅读码农的产出物代码
    │
    ▼
确定文档类型
    │
    ├── README → 项目说明
    ├── API 文档 → 接口定义
    ├── 架构文档 → 模块关系
    └── 代码注释 → 补充复杂逻辑注释
    │
    ▼
编写文档
    │
    ▼
黑板更新产出物
    │
    ▼
mailbox 通知组织者完成
```

## 禁止事项

- ❌ 不要写废话（每句话要有信息量）
- ❌ 不要写和代码不一致的文档
- ❌ 不要给简单代码加注释（`let a = 1` 不需要注释）
