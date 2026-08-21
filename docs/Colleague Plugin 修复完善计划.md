# Colleague Plugin 修复完善计划

## 目标与默认决策

将项目从独立 Express + Vite 原型重构为可安装、可运行的 DeepSeek Harness（DSH）插件。首个可发布版本只承诺“可控的多 Agent 软件交付闭环”，不承诺 L0–L3 自动蒸馏记忆、混合 CLI 团队或多团队协作。

默认约束：

- 使用 DSH 的 Cordis bundle、`ctx.subagents`、会话和任务生命周期；删除自写 ACP 客户端、CLI shell fallback、独立 Express API。
- 首版每个团队绑定一个 DSH 会话和一个工作区；同一工作区中同一时刻最多一个代码写入任务。
- 默认拒绝高风险权限；用户需通过 DSH 的既有权限机制确认。
- “长期记忆”首版实现为持久化团队事件、任务结果和检索注入；L0–L3 蒸馏移入后续版本。
- 所有 DSH 依赖固定到一个已验证版本，并用契约测试防止预览版升级破坏集成。

## 实施项目与验收目标

### 1. 建立可安装的 DSH Bundle

将入口改为 Cordis 插件，提供 `apply(ctx)`；补齐 `dsh.bundle` manifest、`cordis.patch.yml`、构建产物和 peer dependencies。Host 端注册团队运行时服务，Client 端注册 DSH 内嵌团队面板。

移除独立端口、CORS、`/api/*`、Vite 代理和 `execSync` CLI fallback。保留现有 UI 组件，仅迁移其数据源。

验收目标：

- `dsh plugin --profile colleague-dev add ./colleague-plugin` 成功。
- `dsh --profile colleague-dev --dump-config` 能看到插件层与所有依赖行。
- 启动 DSH Web 后，插件面板在宿主内可见，不再需要 `npm run server` 或 `npm run dev`。
- 卸载插件后，团队服务、事件监听和后台任务全部释放。

### 2. 用 DSH 原生 Subagent 替换自写 ACP 层

删除 `ACPSessionManager`、PATH 扫描和自定义 JSON-RPC 生命周期。通过 `ctx.subagents` 使用已注册的 `acp`、`codex` 或 `claude-code` provider；角色配置只能选择已注册且能力满足要求的 provider。

“可用 Agent”定义改为“当前 profile 已配置的 provider”，而非“PATH 中存在二进制”。保留 provider 名称、模型、权限模式和能力摘要供 UI 展示。

验收目标：

- 不再直接 `spawn()`、`execSync()` 或手工发送 ACP JSON-RPC。
- 未注册 provider、provider 不支持请求能力、启动失败时，任务进入明确的 `blocked` 或 `failed` 状态并显示原因。
- 使用一个真实 DSH provider 完成一次最小 coder 任务，运行结束后无残留子进程。
- 发现/选择界面不会展示未经 DSH provider 验证的 CLI。

### 3. 重建团队运行时与状态模型

新增 `TeamRuntime` 服务，采用“追加事件 + 状态投影”管理团队、成员、任务、产出物、质量结论和用户指令。任务与事件使用稳定 UUID，不再以标题作为依赖标识。

定义固定状态：

- Team：`idle → planning → running → paused → completed | failed | cancelled`
- Task：`planned → ready → running → blocked | passed | failed | cancelled`
- Quality：`pending → approved | changes_requested | test_passed | test_failed`

所有状态迁移通过单一 reducer 校验；未知任务、非法迁移、重复完成和过期事件必须拒绝并记录审计事件。

验收目标：

- 暂停、恢复、修正、接管、跳过全部按真实 `teamId` 和 `taskId` 路由，不再出现 `leader`/`leader-01` 不一致。
- 刷新 Web、重新加载插件后，团队状态、任务、消息和事件可恢复。
- 单元测试覆盖合法迁移、非法迁移、重复事件、取消运行中任务与失败恢复。
- 每个任务可从 UI 回溯到输入、执行者、结果、产出物、测试结果和最终结论。

### 4. 将 Leader 改为受约束的计划器

Leader 不直接输出任意 JSON；只允许输出经过 schema 校验的动作：`create_task`、`unblock_task`、`request_review`、`request_test`、`request_docs`、`report`、`ask_user`。

计划器输出必须校验角色、依赖、任务数量、并发额度和预算。无效输出最多自动重试两次，仍失败则把团队置为 `blocked` 并要求用户处理。初始计划不得同时派发存在依赖关系的任务。

验收目标：

- 非 JSON、缺字段、未知角色、循环依赖、超额并发均不会启动子任务。
- 审核要求修改时自动创建修复任务，修复后必须重新审核。
- 测试失败时自动创建修复任务，修复后必须重新测试。
- 所有任务通过后才允许文档任务和最终报告。
- 空计划、全失败计划、部分取消计划都产生明确的终态报告，而不是静默结束。

### 5. 建立真实的角色结果与质量门禁

为 coder、reviewer、tester、docs 定义统一结构化结果协议。结果包含：状态、摘要、产出文件、问题列表、测试命令、测试结果和阻塞原因。

不能再以“子进程成功退出”视为任务完成。Reviewer 的 `changes_requested`、Tester 的 `failed` 必须阻止最终交付；Docs 任务只读取已通过质量门的产出物。

验收目标：

- 单独模拟 coder 成功、reviewer 拒绝、coder 修复、reviewer 通过、tester 失败、coder 修复、tester 通过的完整闭环。
- 每个质量结论在 UI 中展示具体问题、文件、行号和建议。
- 没有通过审核和测试的代码不能触发 `team completed`。
- Agent 返回非结构化内容时，任务不会被误标记为通过。

### 6. 工作区、并发与权限安全

工作区由父 DSH session 提供，启动前执行预检：目录存在、Git 状态可读、允许写入范围明确、当前变更基线已记录。

首版采用串行写入：coder 与 coder、coder 与 docs 不可并发写；review/test 仅在依赖完成后并发读取。产出物通过任务前后的 Git diff 归属，不依赖 ACP 工具调用事件。

取消、超时、权限拒绝和 provider 崩溃必须回收后台运行，并将任务标为 `blocked` 或 `failed`。不允许暴露无认证的本地 HTTP 控制接口。

验收目标：

- 两个写任务同时准备时，第二个保持 `blocked`，直到第一个释放工作区锁。
- 每个完成任务的产出文件与 Git diff 一致。
- 超时、取消和 provider 崩溃后没有孤儿任务或子进程。
- 默认权限策略下，未经用户确认的高风险操作不能执行。

### 7. 修复并迁移团队面板

面板改订阅 `TeamRuntime` 的真实事件流，不再采用 500ms/1s 双重轮询。任务、消息、流输出、错误和成员状态都来自同一事件投影。

暂停、恢复、修正、接管、跳过必须等待服务端确认后更新 UI；跳过操作要求用户选择具体任务。成员重命名、增加、删除改为受控团队配置操作，不允许只修改前端数组。

并行、单聊、看板三种视图必须展示不同信息，流式输出需有截断、展开和错误状态。

验收目标：

- 普通任务分派与完成消息能出现在看板，不只显示广播消息。
- 点击暂停后不再派发新任务；恢复后可继续调度。
- 点击跳过能准确取消选中任务，不影响其他任务。
- 网络或运行时错误在界面可见，不能被静默吞掉。
- 三种视图有可观察的不同布局与交互行为。

### 8. 让配置、模板、技能和记忆真正生效

用 DSH 插件配置 schema 替换当前未解析的 YAML。团队配置必须真正决定成员、角色、provider、模型、并发、预算、权限、工作区和记忆开关。

角色模板和技能文件加载为实际 prompt/skill 资源；缺失文件、未知模型族或无效角色在插件启动时失败并给出诊断。

首版记忆实现为持久化团队事件、架构决定、已验证命令和质量结论；按任务检索少量相关内容注入 Leader 或执行角色。删除“已实现四层记忆”的产品表述。

验收目标：

- 修改团队配置后，创建团队所得成员、provider 与并发策略发生对应变化。
- 模板缺失或配置无效时，启动失败且错误定位到字段或文件。
- 重启后可检索到上一任务的架构决定和测试结论。
- 单次任务注入的记忆内容有数量与字符上限，避免无限增长。

### 9. 补齐自动化测试与发布门禁

增加单元、契约、集成和端到端测试：

- 单元：状态机、消息路由、依赖 DAG、结果校验、锁和取消。
- 契约：bundle 安装、`--dump-config`、DSH 服务注入和 provider 能力拒绝。
- 集成：mock provider、真实 DSH provider 最小任务、事件持久化与恢复。
- 端到端：正常交付、审核退回、测试失败、暂停恢复、接管、跳过、超时、插件重载。

构建脚本必须检查 Host、Client 和配置；新增 `test`、`test:integration`、`test:e2e`、`check`。`check` 是合并与发布前的唯一门禁。

验收目标：

- `npm run check` 覆盖服务端、客户端、配置和类型，不能再遗漏 Host 代码。
- 所有 P0/P1 流程都有自动化回归用例。
- 真实 provider E2E 使用隔离测试仓库，运行后验证 diff、测试结果和进程清理。
- 发布前生成兼容矩阵：DSH 版本、Node 版本、provider、平台与结果。

### 10. 更新产品文档与发布说明

重写 README、PRODUCT、ARCHITECTURE 和配置示例，明确安装方式、权限模型、工作区规则、费用/并发预算、支持的 provider 和已知限制。

删除“照搬 AionUi”“v1.0 已完成”及尚未实现的记忆/流式/配置描述。将视觉设计改述为自有设计规范或合法引用的灵感来源。

验收目标：

- 新用户仅按 README 可完成安装、配置、启动一个测试团队并运行示例目标。
- 功能清单与自动化测试覆盖一致，不宣称未实现能力。
- CHANGELOG 包含破坏性迁移、旧独立服务的移除方式和回滚步骤。

## 交付顺序

1. Bundle 与原生 DSH 集成。
2. TeamRuntime、状态机、干预指令与持久化。
3. 计划器、角色结果、质量门禁与工作区锁。
4. 迁移 UI。
5. 配置、记忆、测试和文档。

只有前四项全部通过验收，才进入真实项目工作区测试；记忆增强、多 CLI 混合团队、历史回放和插件市场发布均排在首版稳定后。
