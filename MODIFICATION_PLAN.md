# dsh-colleague 修改计划

> **依据**:REVIEW.md v1→v2.1 三轮审查 · **基线**:commit c39a05a(main,已推送)
> **当前状态**:tsc 0 err · 175+20+6+11 全绿 · exports 双冒烟通过 · real-load.mjs 真实 cordis 冒烟 exit 0
> **核心结论**:代码质量达标;距离"能在真实 DSH 里运行"差一次宿主接线改造。本计划即为此设计。
> **工作量标记**:S=半小时内 · M=半天内 · L=一天以上

---

## 总览:四个阶段

| 阶段 | 内容 | 规模 | 优先级 |
|------|------|------|--------|
| 一 | 上游宿主 API 契约改造 | L(最大单项) | P0 —— 不做则插件在真实 DSH 无法工作 |
| 二 | v2.1 六个低危缺陷修复 | M | P1 |
| 三 | 遗留清理(UI/文档/死配置/乱码) | M | P2 |
| 四 | 发布前验收门(DoD) | S | 出口标准 |

依赖关系:阶段二、三与阶段一**文件层面基本不重叠,可并行**;阶段一是串行主链;阶段四最后。

---

## 阶段一:上游宿主 API 契约改造(P0)

> 证据基础:deepseek-harness 浅克隆逐文件比对(REVIEW.md 第二节)。上游为 rc 版本,API 可能变动 —— 因此本阶段的工程原则是:**把所有宿主交互收敛到一个薄的 adapter 层**(`core/host-adapter.ts`),宿主变更时只改一处。

### 1.1 Adapter 层搭建【M,先行】
- **新建** `core/host-adapter.ts`:集中封装 resolveWebServer(ctx)、registerRoutes(routes)、resolveSubagents(ctx) 三个函数
- **删除** index.ts 中五层 safeGet/safeHas 私有结构探测(~80 行)—— 上游服务经 module augmentation 直接 `ctx.webServer` 属性访问
- **验收**:tsc 通过;现有单测中 mock context 改走 adapter 后仍绿

### 1.2 WebRoute 形状修正【S】
- 上游 `WebRoute = { kind:'exact'|'prefix', path, handler }`,**无 method 字段**
- index.ts 四条路由(start/answer/intervene/state/events)去 `method`;GET/POST 区分移入 handler 首行 `if (req.method !== 'POST') return send(res,405,...)`
- **验收**:adapter 单测覆盖方法过滤

### 1.3 Provider 名修正【S】
- `config/team.yaml` 全体成员 `provider: "dsh"` → `"dsh-sdk"`(@deepseek-ai/dsh-subagent-dsh-sdk 注册名;acp/codex/claude-code 不变)
- `core/config/loader.ts` 默认 provider `'dsh'` → `'dsh-sdk'`
- README「Key Config Fields」示例同步
- **验收**:grep 全仓库无裸 `'dsh'` 作为 provider 值残留

### 1.4 SubagentStartRequest 必填字段【M】
- 上游 `parent` 与 `signal` **必填**(非可选)
- 做法:OrchestrationLoop.callSubagent 传 `signal: this.abortController.signal`(已有);`parent` 需读上游 Agent 语义后决定 —— 若需宿主会话代理,经 adapter 从 ctx 取;若允许 null-ish 占位则以最小合法值传入并注释原因
- SubagentRuntimeLike 接口签名同步收紧
- **验收**:real-load.mjs 仍 exit 0;类型上不再依赖可选性假设

### 1.5 Web 面板接线重做【L,本阶段核心】
现状两处幻想:① `settings.registerSection({render,onAction})` 上游不存在(settings 是配置命名空间系统);② `entry.client` + `registerPanel(mountEl, runtime)` 要求宿主把服务端 TeamRuntime 注入浏览器,上游机制是 **dsh.client modules → window.__DSH_BOOT__**,由宿主 serve `/plugins/<id>/client.js`。

目标形态:
- **服务端**:保留现有 4 条 HTTP 路由(state/events/start/answer/intervene)作为唯一数据面;新增 SSE 或保留轮询 `/events?since=`(建议先用 since 轮询,SSE 作后续优化)
- **客户端**:web/main.tsx 改造为上游 client module 约定 —— 按 packages/client/modules 的 dsh.client 声明方式注册,从 `window.__DSH_BOOT__` 取挂载点;数据源改为 fetch 本插件 HTTP 路由;干预按钮全部走 POST /intervene(六动作已齐)
- **删除**:registerPanel 导出及其 runtime 注入参数、settings.registerSection 整段(服务端表格 UI 由客户端面板取代;若上游 settings 有真实的自定义卡片机制,以 publish.md 实测为准再决定是否保留降级表格)
- **配套**:tsdown entry 保持 web/main.tsx;cordis.patch.yml 增加 modules 行声明客户端入口(参照 packages/bundle/web-app/cordis.patch.yml 写法);tests/e2e/web-preview-main.tsx 同步改为 fetch 型 mock
- **验收**:① 构建产物被宿主以 /plugins/dsh-colleague/client.js 加载;② 浏览器面板能显示成员/任务并能执行六动作;③ web/team-panel 组件层尽量复用(它们只吃 props,数据源切换不影响)

### 1.6 真实 DSH 端到端联调【M】
- 在装有 DSH 的机器跑 scripts/install-to-dsh-web.sh
- 手动场景:面板可见 → POST /start → leader 分解 → coder 执行且工作区出现 git diff 产物 → request_review/test 流转 → report 完成;六动作逐一触发;kill 重启后团队恢复(team.id 已有)
- **验收**:形成一份 E2E checklist 打卡记录(附到本文件末尾)


---

## 阶段二:v2.1 六个低危缺陷修复(P1,可与阶段一并行)

### 2.1 isLocalOrigin 前缀匹配绕过【S】【中低】
- **问题**:`origin.startsWith('localhost')` 可被攻击者域名 `localhost.evil.com` 绕过
- **改法**(index.ts):用 `new URL(origin)` 解析后精确比对 `hostname`,允许集合 `['localhost','127.0.0.1','[::1]']`;解析失败视为拒绝;Host 回退分支同样精确匹配并剥端口
- **验收**:新增单测 —— 合法 Origin 放行;`http://localhost.evil.com` 403;无 Origin(curl)放行;rebound Host 拒绝

### 2.2 runtime 状态机幂等 + handler 防崩【S】【低中】
- **问题**:ask_user 待答时用户 pause → `runtime.pause()` 对 paused 团队再转换 → transitionTeam throw(team-runtime.ts:350);intervene 的 switch 无 per-action try/catch
- **改法**:① TEAM_TRANSITIONS 增加自环幂等(`paused:['running','failed','cancelled','paused']`,`running:[...,'running']`)或 transitionTeam 对 from===to 直接 no-op 返回;② index.ts intervene/start/answer handler 每个 action 分支包 try/catch,失败返回 500 JSON 而非裸抛
- **验收**:单测覆盖 double-pause / pause-during-ask_user / answer 后再 resume 三序列不再抛

### 2.3 slug 混合名残留碰撞【S】【低】
- **问题**:"Team 团队A" 与 "Team 团队B" 的 slug 都收敛为 "team"(hash 仅纯非 ASCII 时启用)
- **改法**(loader.ts):当 name 含任何非 `[a-z0-9 -]` 字符(即正则替换发生过压缩)时,一律追加 hash 后缀:`team-${slug}-${hex8}`;纯 ASCII 名保持现状不变(兼容已发布配置)
- **验收**:三个断言 —— "Frontend Team" id 不变;"前端团队" 与 "前端团队B" 不同;"Team 团队A/B" 不同

### 2.4 readJsonBody 超限挂起风险【S】【低】
- **问题**:req.destroy() 后依赖 'error' 事件 resolve,存在 Promise 永不落定风险
- **改法**:超限分支立即 `resolve('')` 再 destroy;handler 对空 body 且 Content-Length>0 的请求返回 413 Payload Too Large
- **验收**:单测模拟超限 body → 413 且 handler 正常返回

### 2.5 Fix-task 启发式收紧【M】【低】
- **问题**:"Fix ..." 标题匹配可被任意无关 passed 任务绕过拒绝阻断
- **改法**(gates.ts):标题匹配收紧为「title 以 fix 开头 **且** title 或 description 包含原失败 task id 前 8 位」;dependencies 匹配保留为主路径;同步 gates.ts 头注释与 docs/ARCHITECTURE.md 第 4 条措辞
- **验收**:orchestration-loop.test.ts「Review rejected → fix」场景仍绿;新增「无关 Fix 任务不解除阻断」反例

### 2.6 /start 并发 TOCTOU【S】【低】
- **问题**:两请求同过状态检查,后者 throw 被 .catch 吞但仍返回 200
- **改法**:loop 增加 `startInFlight` 同步标志(进入 start() 前置位、finally 清除);或 /start 在 send(200) 前改为 await start() 完成首帧(leader_called 事件)再返回实际状态
- **验收**:并发双 /start 单测:恰一个 200、一个 409

---

## 阶段三:遗留清理(P2)

### 3.1 revise 增强【M】
现状仅追加事件,靠 leader Recent Events 的 JSON 截断间接可见。改法:handleIntervention revise 时将 message 注入 loop.currentGoal(与 answerUser 同路径),保证 leader 下轮必然看到。验收:单测断言 revise 后 leader prompt 含该 message。

### 3.2 i18n 补完【M】
- setLang 加切换入口(TeamTabs 头部按钮)+ localStorage 持久化 + 组件订阅 lang-change 重渲染
- TaskCard.tsx:87 硬编码 "blocked by ..." 收编进翻译表;index.ts settings 区内联 isZh 三元改走 i18n 模块(若 1.5 移除 settings 区则此项随之取消)
- **验收**:切换语言后全 UI 即时生效且刷新后保持

### 3.3 blocked 状态独立化【S】
web/types.ts mapTaskStatus 单列 blocked(不再并入 failed);i18n 表补 `task.status.blocked`(zh:"等待锁"/en:"Blocked");TaskCard STATUS_COLOR 补 failed(红)与 blocked(黄)。验收:UI 中锁等待任务显示"等待锁"而非"失败"。

### 3.4 死文件与死配置处置【S】
- config/preset.yml:重写为与上游 preset 结构一致(**删除幽灵引用 ./core/discovery/agent-discovery.ts**)或整体移出 package.json files;二选一,建议前者保留文档价值
- config/model_families.yaml 与 .env.example:仓库内零引用 —— 要么在 loader/README 中真正接线,要么从 files 数组移除;建议移出发布包、保留在仓库作设计稿并在文件头注明 status: design-doc
- team.yaml 无效段(workspace/intervention/memory.persistence/concurrency.max_writers):loader 接通(workspace 已通,intervention 与 persistence 接线)或删除字段并在 README 注明 v1 不支持;**禁止维持"配了不生效也不报错"的现状**
- CHANGELOG 年份 2025→2026;preset.yml version '1.0.0' → '0.1.x' 对齐

### 3.5 乱码测试名清理(~50 处)【M】
按 REVIEW.md v2.1 附带的分布清单逐文件重命名(quality-gates ~15、leader-planner ~11、memory-service 6、workspace-lock 4 及散见);同时修 orchestration-loop.ts:4 'orchestrationion'。验收:grep 本轮乱码特征模式(如 `[a-z](Rejected|Passed|Legal)`、全角标点入标题)命中数为 0。

### 3.6 发布包瘦身【S】
npm 包当前含 5 个 .map(约半数体积):tsdown 配置 `sourcemap:false` 或从 package.json files 排除 *.map。验收:npm pack 无 .map。

### 3.7 可访问性三项【S】
TaskCard 展开控件补 aria-expanded/aria-controls;InterventionBar Revise 输入框补 aria-label;干预按钮加 disabled/busy 态(动作进行中防重复提交)。

---

## 阶段四:发布前验收门(Definition of Done)

全部满足方可宣称"能在真实 DSH 里运行":

**自动化(已有,持续保持)**
- [ ] npm run check 全绿(tsc + 四层测试 + build)
- [ ] real-load.mjs exit 0
- [ ] exports 双冒烟导入通过;npm pack 无 .map、无死文件

**真实 DSH 端到端(阶段一完成后执行,新机器打卡)**
- [ ] `dsh plugin --profile web add` 成功,plugin-console 显示 enabled
- [ ] DSH Web 内加载 /plugins/dsh-colleague/client.js,面板渲染成员与任务
- [ ] POST /start → leader 分解 ≥2 任务 → coder 执行且工作区出现 git diff 可归因产物 → review/test 流转 → report 完成
- [ ] 六动作逐一验证:pause / resume / revise(message 进 leader prompt)/ takeover / skip(taskId)/ answer(ask_user 不再挂起)
- [ ] kill 进程重启:团队状态经 events.jsonl 恢复(team.id 生效)
- [ ] Windows:install-to-dsh-web.ps1 在真机跑通(含 CJK 路径)
- [ ] 安全抽查:无 Origin 的 curl 放行;`Origin: http://localhost.evil.com` 返回 403;超限 body 返回 413

## 执行顺序建议

```
第 1 步:1.1 adapter + 1.2 路由形状 + 1.3 provider 名   (半天,小步铺路)
第 2 步:阶段二 6 项低危修复                              (并行,互不依赖)
第 3 步:1.4 parent/signal + 1.5 面板接线重做            (主链,最大单项)
第 4 步:1.6 真机联调 → 按发现回补
第 5 步:阶段三清理(可与第 3-4 步穿插)
第 6 步:阶段四验收门逐项打卡 → 打 tag 发布候选
```

## 风险与备注

1. **上游是 rc 版本**:API 可能再变。adapter 层(1.1)是唯一防线 —— 禁止在 adapter 之外直接触碰 ctx/webServer/subagents
2. **registerPanel 移除波及面**:tests/e2e/web-preview-main.tsx、web/team-panel 组件 props 需同步;组件层尽量不动(它们是纯 props 渲染,换数据源成本低)
3. **canFinalize 语义再收紧**(2.5)会影响 orchestration-loop.test.ts 既有断言,先改测试预期评审再改实现
4. **team.yaml 兼容性**:provider 改名(1.3)对已部署用户是破坏性变更 —— loader 对 `'dsh'` 做一次性别名映射到 `'dsh-sdk'` 并打 deprecation 日志,下个大版本移除
5. 所有改动保持现有纪律:tsc 严格、无 @ts-ignore、每项带验收单测;阶段一完成前**不要**发版

---

*计划生成于 2026-08-23,基于 REVIEW.md v1→v2.1 三轮审查证据。执行过程中若上游 API 与本文假设不符,以实测为准并回写本文件相应条目。*
