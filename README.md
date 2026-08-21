# Colleague Plugin

> 有记忆、有角色的长期 AI 团队 — 基于 DeepSeek Harness (DSH) 的多 Agent 协作插件

## 是什么

Colleague Plugin 是一个 DSH (DeepSeek Harness) Cordis 插件，让多个 AI Agent 像真正的同事一样组队干活：

- **Leader 拆解目标** → Coder 写代码 → Reviewer 审核代码 → Tester 测试验证 → Docs 补文档
- 全自动流转，用户随时可以暂停、修正、接管或跳过
- 基于 DSH 原生 Subagent 架构，不自己管理子进程

## 安装

### 前置条件

- Node.js >= 22.19.0
- 已安装 DSH (DeepSeek Harness)
- 已在 DSH 中注册至少一个 subagent provider

### 安装插件

```bash
# 在 DSH 中添加插件
dsh plugin --profile colleague-dev add ./colleague-plugin

# 验证安装
dsh --profile colleague-dev --dump-config
```

### 启动

```bash
# 启动 DSH Web，团队面板将作为嵌入面板显示
dsh --profile colleague-dev web
```

不再需要 `npm run server` 或 `npm run dev` — 面板直接在 DSH Web 宿主内运行。

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

workspace:
  path: "./workspace/"

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

## 权限模型

- 默认权限模式为 `reject`（安全第一）
- 所有高风险操作需用户通过 DSH 的权限机制确认
- 未经用户确认的高风险操作不能执行

## 工作区规则

- 工作区由父 DSH session 提供
- 启动前执行预检：目录存在、Git 状态可读、允许写入范围明确
- 首版采用串行写入：coder 与 coder、coder 与 docs 不可并发写
- 产出物通过任务前后的 Git diff 归属

## 记忆

首版记忆实现为持久化团队事件、架构决定、已验证命令和质量结论。按任务检索少量相关内容注入 Leader 或执行角色。

- 单次注入最多 5 条记忆，每条最多 500 字符，总计不超过 2000 字符
- 重启后可检索上一任务的架构决定和测试结论
- L0–L3 蒸馏移入后续版本

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

# 完整检查（类型 + 测试 + 构建）
npm run check
```

## 已知限制

- 首版每个团队绑定一个 DSH 会话和一个工作区
- 不支持多 CLI 混合团队（所有成员使用同一 provider）
- 不支持 L0–L3 记忆蒸馏
- 不支持多团队协作
- 不支持历史回放

## License

MIT
