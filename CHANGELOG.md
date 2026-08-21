# CHANGELOG

## v0.1.0 (2025-08-21)

### 破坏性迁移

本版本将 Colleague Plugin 从独立 Express + Vite 原型重构为 **DeepSeek Harness (DSH) Cordis 插件**。以下是不兼容变更：

#### 移除的功能

- **独立 Express API 服务**：删除 `server/` 目录及其所有 HTTP 端点（`/api/*`、CORS、Vite 代理）。不再需要 `npm run server`。
- **自写 ACP 客户端**：删除 `ACPSessionManager`、PATH 扫描和自定义 JSON-RPC 生命周期。改用 DSH 原生 `ctx.subagents`。
- **CLI 扫描发现**：删除前端 CLI 扫描界面。"可用 Agent" 定义改为 "当前 DSH profile 已配置的 provider"。
- **独立 Vite 开发服务器**：删除 `npm run dev`。面板嵌入 DSH Web 宿主。
- **L0–L3 记忆蒸馏**：移入后续版本。首版实现为持久化团队事件、架构决定、已验证命令和质量结论的检索注入。

#### 新增的架构

- **Cordis 插件入口**：`index.ts` 导出 `apply(ctx)`，注册为 DSH 服务 `colleague-team`。
- **追加事件 + 状态投影**：`TeamRuntime` 管理团队状态，所有变更通过 `appendEvent` 完成，状态由事件投影得出。
- **Leader 计划器**：Leader 输出经过 schema 校验（7 种 action 类型），无效输出最多重试 2 次。
- **质量门禁**：统一结构化结果协议，`changes_requested` 和 `test_failed` 阻止最终交付。
- **工作区串行写入锁**：coder 与 coder、coder 与 docs 不可并发写。
- **事件驱动 UI**：移除 500ms 轮询，通过 `subscribe` 实时响应后端事件。
- **事件持久化**：事件流写入 `events.jsonl`，重启后可恢复完整团队状态。
- **记忆服务**：持久化到 `memory.jsonl`，按任务检索注入，有数量与字符上限。

### 迁移步骤

1. **安装 DSH**：确保已安装 DeepSeek Harness（`dsh`）。
2. **安装插件**：
   ```bash
   dsh plugin --profile colleague-dev add ./colleague-plugin
   ```
3. **配置团队**：编辑 `config/team.yaml`，指定成员、角色和 provider。
4. **启动面板**：
   ```bash
   dsh --profile colleague-dev web
   ```
   在 DSH Web 内看到团队面板。

### 回滚步骤

1. **卸载插件**：
   ```bash
   dsh plugin --profile colleague-dev remove colleague-plugin
   ```
2. **恢复旧版本**：`git checkout` 到重构前的 commit。
3. **清理持久化数据**：删除工作区中的 `.colleague/` 目录。
   ```bash
   rm -rf .colleague/
   ```

### 已知限制

- 首版每个团队绑定一个 DSH 会话和一个工作区。
- 同一工作区中同一时刻最多一个代码写入任务（串行写入）。
- 不支持多 CLI 混合团队。
- 不支持 L0–L3 记忆蒸馏。
- 不支持多团队协作。
