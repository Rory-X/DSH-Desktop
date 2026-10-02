# DSH 0.1.6-alpha.1 更新与 Desktop / Plugs 适配计划

核查日期：2026-09-15，Asia/Shanghai。**仅评估与计划，未实施升级或代码适配。**

## 结论

**Plugs 有确定的接口适配项，建议完成第一批适配后再升级日常环境。Desktop 的启动协议仍匹配，主要需要补齐插件部分失败的诊断与恢复状态。**

本机实际 runtime 为 `0.1.5-rc.2`，因此本报告比较 `0.1.5-rc.2 → 0.1.6-alpha.1`，不重复把此前 0.1.5 的变化计入本次更新。

| 基线 | 核查结果 |
| --- | --- |
| 本机 `~/.dsh/runtime` | `@deepseek-ai/dsh@0.1.5-rc.2` |
| npm `alpha` | `0.1.6-alpha.1`，2026-09-15 11:23:13（UTC+8）发布 |
| npm `latest` / `next` | `0.1.5-rc.1` / `0.1.5-rc.2`；不能把 alpha 当成 latest |
| 官方比较提交 | `fb2c4b9e698e30edb738bca4cf0618587db7d203 → 0a15e36e7f82b6ed45af6fa9759f29b40dcd965d` |
| Desktop | 工作区版本 `0.2.0`，HEAD `07edc9a`，核查开始时工作区干净 |
| Plugs | HEAD `64c5bad`，包含已有的 workspace-plus 未提交修改；本次按当前工作区读取，未覆盖这些修改 |

来源：[官方 registry][registry]、[官方 Release][release]、[固定标签比较][compare]。本机版本来自安装包 manifest；工作区判断不代表已安装 Electron 应用的打包产物与当前源码完全相同。

## 这个版本更新了什么

1. **Web 工作区体验**：右侧栏内置多标签终端，支持 Shell 选择、刷新后恢复；设置页可以查看和恢复已归档会话。文件、Skill 引用与交付文件默认进入侧栏预览，文件树滚动、图片/PDF 尺寸和预览选择也有调整。
2. **MCP 与自动化入口**：MCP 增加资源发现、读取和 URI 模板，迁移到官方 SDK v2，支持协议协商、工具分页和无工具服务器。Headless 增加 stdin 输入、`--session-id` 续跑和 `--json` 逐行事件输出。
3. **新执行能力**：本地 DSH 可通过 SSH 使用远端工作区；新增实验性 Browser Use、Computer Use、Auto review。Team 模式统一 `spawn_teammate`，默认队友上限增至 16。
4. **模型与图片处理**：DeepSeek 默认改用 Messages 协议，支持 Files API 复用图片；图片缩放、质量与 Token 估算调整，新增 image offload 事件；请求图片缓存迁到 `DSH_HOME/cache/attachments/request-images`。
5. **日常交互与修复**：输入框加号菜单重新分组；会话最近更新/手动排序、按轮次分叉、重连提示、Trajectory、PTC 展示、文件 diff 和 Linux 子进程清理得到改进。
6. **插件作者必须注意的变化**：`agent/session-start` 移除，改为等待执行的 `agent/created`；PTC 包/服务更名；工作流执行器更名；Node PTC 改独立进程且 `process.env` 为空；E2B 内置执行后端移除；配置热更新失败不再事务回滚。三个同步历史读取方法仅标为弃用，仍保留实现。

以上来自官方发布说明及对应源码；完整条目见[官方 Release][release]。接口影响详见下面的逐项定位。

## 第一批：升级前处理

### P0-1：修复 Codex / Warp 终端的启动契约

**确定缺字段。** 新版 `SubprocessTerminalSpawnSpec` 要求 `terminalType: string`，local provider 将其用于 PTY 名称，并以它覆盖 `env.TERM`。当前插件仅传 `env: { TERM: 'xterm-256color', ... }`，缺少新字段。因此原先的 TERM 设置不能满足新版契约，可能影响终端创建或终端能力声明；本次未运行新版 PTY，不把它写成已复现崩溃。

- 本地：[terminal/server.ts](/Users/jiahaoqian/proj/DSH-Plugs/plugins/dsh-codex/src/host/terminal/server.ts:368)。
- 上游：[必填类型][terminal-types]、[实际消费字段的 provider][terminal-provider]。
- 计划：显式传入匹配前端模拟器的 `terminalType`；同步共享层类型与终端 handle 契约。若启用 SSH 工作区，再从 provider 的 `terminalEnvironment()` 获取远端 Shell 信息，避免套用本机 `process.env.SHELL`。
- 验收：用函数/接口测试核对 spawn 参数和取消逻辑；隔离环境验证终端建立、输入输出、尺寸变化及关闭回收。远端路径作为单独覆盖项。

### P0-2：迁移桌宠生命周期监听

**确定旧事件不会再触发。** `dsh-whale-girl` 仍监听 `agent/session-start`，用于新会话欢迎、恢复统计及状态持久化。上游已删除旧事件，改为异步串行等待 `agent/created`，payload 提供 `agent/source/signal`。

- 本地：[whale-girl/index.ts](/Users/jiahaoqian/proj/DSH-Plugs/plugins/dsh-whale-girl/src/index.ts:282)。
- 上游：[AgentRegistry][agent]。
- 计划：通过共享 runtime 接入新版事件，保留 `source` 的新建/恢复语义；监听器只做轻量状态更新，避免阻塞首次模型请求。若保留旧版支持，以明确的兼容分支订阅，避免重复计数。
- 验收：新建、恢复、clear/compaction 来源区分正确；单次事件只记一次；监听失败或取消不会造成误计数。
- 当前未找到 Plugs 直接调用 `agents.register()` / `announce()`；Codex 的 `agents.create()` 已使用 `await`，无需为这条规则重复改造。

### P0-3：建立与目标 runtime 一致的共享依赖基线

**确定存在历史版本漂移，不能拿旧类型检查证明新版兼容。** `packages/runtime` 的多数官方包仍固定 `0.1.1-rc.2`；UI primitives 固定 `0.1.5-rc.1`；依赖门禁也将这些旧值写死。当前部分结构化接口已人工补到 0.1.5，但它们仍可能漏掉此次新增字段。

- 本地：[runtime/package.json](/Users/jiahaoqian/proj/DSH-Plugs/packages/runtime/package.json:30)、[ui/package.json](/Users/jiahaoqian/proj/DSH-Plugs/packages/ui/package.json)、[依赖门禁](/Users/jiahaoqian/proj/DSH-Plugs/scripts/check-dependency-contracts.mjs:3)。
- 计划：按 `0.1.6-alpha.1` 发布包实际依赖清单更新共享层的 dependencies/devDependencies/peerDependencies 与锁文件；逐包核对版本，不能假定所有包都和 CLI 同号。让门禁检查已验证的目标矩阵。插件仍统一经过 `packages/runtime` / `packages/ui`。
- 清理 `packages/runtime/package.json` 中遗留的 `@deepseek-ai/dsh-code-runtime` 开发依赖：当前没有找到生产代码调用；按用途删除，确有需要再换为新 PTC 包，而非机械增加无用运行时依赖。
- 验收：完整 typecheck、dependency-contracts、build 与 client-modules 检查；目标 runtime 的客户端真实导出匹配构建产物。检查本地 link 插件的官方包解析落点，避免运行中混入旧副本。

### P1-1：补齐右侧栏 guide 契约，验证与内置功能共存

**确定类型契约缺项，尚未证实必然导致运行崩溃。** 新版 `SidebarRightGuideEntry` 必须有 `id`，用于卡片身份与新 guide-entry slot。当前共享接口未声明，Codex 的 Files、Git Graph、Warp Terminal、Side Chat 四处 guide 均未提供。

- 本地：[共享 Sidebar 接口](/Users/jiahaoqian/proj/DSH-Plugs/packages/runtime/src/client.ts:94)；四个定义分别位于 `features/files/files-tab.ts`、`features/git-graph/index.ts`、`features/terminal/index.ts`、`features/side-chat/definition.ts`。
- 上游：[tab registry][sidebar-registry]、[guide 渲染][sidebar-guide]。
- 计划：为四个入口添加稳定 `guide.id`；同步共享层的 `multiple`、关闭回调等所需能力。当前每个 provider 仅一个入口，不应把“缺 id”夸大为必触发 duplicate-id 异常。
- 共存策略：官方终端 kind 为 `terminal`，插件为 `dsh-codex-terminal`，**不是同名冲突**。先保留现有功能并验证入口、标签身份、刷新恢复、关闭清理，再决定是否利用上游 `multiple: true` 简化现有 page→resource 转换。
- 文件插件使用 `priority: 'extension'` 接管部分文件预览；核对新版默认文件/Skill 链接仍按预期路由，图片/PDF 仍正确进入官方预览器。
- 验收：注册元数据和导航/关闭纯逻辑测试；不以渲染组件或 DOM 断言作为 Plugs 的测试方式。

### P1-2：Desktop 与插件管理统一识别“配置已保存 / 实际已生效 / 部分失败”

**确定上游状态语义改变，本地当前判断不足。** 新版可选插件未激活会输出 warning，但服务继续；只有 required 项或根配置失败才阻断启动。配置热更新取消事务回滚，激活失败可能留下部分生效状态。

- Desktop：[main.ts](/Users/jiahaoqian/proj/DSH-Desktop/src/main.ts:327) 就绪后返回成功且清空失败输出；[plugin-quarantine.ts](/Users/jiahaoqian/proj/DSH-Desktop/src/plugin-quarantine.ts:97) 按旧 `名字: 错误` 分块。新版诊断可能为 `entryId (module): ...`，需要更新识别。
- Plugs：[profile-manager.ts](/Users/jiahaoqian/proj/DSH-Plugs/plugins/dsh-plugin-config/src/profile-manager.ts:120) 在 `loader.update()` 返回后直接报告 `live: true`，未等待整棵 loader/fiber 稳定并核验目标状态；影响管理界面的 enable/disable 结果，相关同步反馈也应检查。
- 上游：[启动审计及热更新实现][boot]。
- 计划：Desktop 保留可选插件 warning 并提供可见的诊断；required failure 继续进入恢复流程，按实际归因列出插件。插件管理等待激活完成，核验配置和目标 fiber 状态（启用应 active，禁用应已卸载/禁用）；结果区分保存、成功应用和部分失败，提供修复配置后重试/重启。
- 验收：正常启动、一个可选插件失败、required 失败、配置语法错误、热更部分成功、修复后恢复；不把“端口可连”或 `loader.update()` 返回作为全部插件健康的证明。

## 第二批：兼容债与可选能力

### 历史读取迁移：需要排期，但不是本版删除 API 导致的阻断

`snapshotEvents`、`eventAt`、`ownEvents` **仍有实现，只增加弃用标记**。debug-mode、session-archive、workspace-plus 使用的 `snapshotEvents()` 可暂时继续运行，不应宣称升级后立即失效。[源码][session]、[官方迁移方向][history-note]。

本次会话格式号仍为 v3，不是再次升级格式号；但新增 `image/offload` 事件及其消息投影，不能据此推导旧版能读取所有新版写入。恢复/分叉测试应覆盖含该事件的历史。[投影设计][message-projections]。

建议统一到共享 runtime：

- 标题、preset、turn 是否打开等常规状态采用投影或增量事件维护。
- 用户按需查看历史采用有界的异步分页读取；不要只是给“全量同步快照”换个函数名。
- Codex Side Chat 的上下文/预设读取仍探测 `parent.events` 或 `parent.log?.events`；共享 `sessionEventsOf()` 也仅看旧 `events`。这是现存兼容债，可能静默取空，**不是 0.1.6 才引入的问题**；本轮可顺带消除，验收上下文继承与 preset 选择。

涉及：[共享读取器](/Users/jiahaoqian/proj/DSH-Plugs/packages/runtime/src/session-events.ts:17)、[Side Chat 上下文](/Users/jiahaoqian/proj/DSH-Plugs/plugins/dsh-codex/src/host/side-chat/context.ts:103)、[Side Chat preset](/Users/jiahaoqian/proj/DSH-Plugs/plugins/dsh-codex/src/host/side-chat/server.ts:401)、[debug-mode](/Users/jiahaoqian/proj/DSH-Plugs/plugins/dsh-debug-mode/src/session-events.ts:31)、[archive](/Users/jiahaoqian/proj/DSH-Plugs/plugins/dsh-session-archive/src/index.ts:209)、[workspace-plus](/Users/jiahaoqian/proj/DSH-Plugs/plugins/dsh-workspace-plus/src/session-titles.ts:132)。

### 功能重叠：先回归，不默认删除插件

- **session-archive**：内置已归档列表与恢复功能出现后，评估插件独有能力；先核对两边归档、恢复及标题来源，避免重复入口造成误解。
- **workspace-plus**：上游排序/空会话行为已修改，检查置顶区、未读/待处理状态、冷标题补齐和会话菜单。当前工作区已使用自己的置顶区，不套用旧调查中“必须调用 insertSessionBefore”的过期方案。
- **agent-plugin MCP**：当前自有 HTTP client 固定初始化版本 `2024-11-05`，只实现 initialize/tools-list/tools-call，未处理资源与分页。官方 MCP 升级不会自动升级这条独立链路；若希望能力包也获得新版资源支持，需要单独扩展或接入官方能力。现有工具调用不因上游 SDK v2 自动失效。[本地实现](/Users/jiahaoqian/proj/DSH-Plugs/packages/agent-plugin/src/mcp-http.ts:54)。

### 配置迁移：仅对实际命中的自定义配置执行

- PTC 名称改为 `ptc-runtime` 系列，服务改为 `ptcRuntime`；具体包括 `dsh-code-runtime → dsh-ptc-runtime`、`dsh-code-runtime-worker-thread → dsh-ptc-runtime-node`、`dsh-workflow-worker-thread → dsh-workflow-ptc`。Node PTC 独立进程、文件策略、空环境变量和输出/内存限制会影响依赖旧执行环境的脚本。[命名决策][ptc-vocabulary]。
- 删除/替换 E2B 自定义配置；需要 Ralph 时显式启用。
- 连接 DeepSeek 官方 API 且手工固定旧根地址时，移除覆盖或使用 `https://api.deepseek.com/anthropic`；自定义第三方地址不能一概替换。若使用 `llm-deepseek` 适配器接 OpenAI 兼容代理，应核对是否需要显式设为 `chat-completions`。[协议配置][deepseek-config]。
- `session-log-deepseek.enabled` 本版默认变为 `true`，连接符合条件的官方 DeepSeek 端点时可随请求贡献会话事件；它与 OTel 开关独立，需检查现有显式设置是否符合预期。[默认配置][deepseek-log]。
- 本次仅对本机 `settings.yaml`、Web profile manifest、`cordis.yml` 和 `cordis.patch.yml` 做定向字面检查，未命中旧 PTC/workflow/E2B 名称或硬编码官方 API 地址。此结果不覆盖环境变量、其他 profile、用户脚本或外部插件。
- 未发现 Desktop/Plugs 直接实现 `SandboxProvider.confine` / `ShellExecutor.start`，因此不把其异步化列为当前仓库确定的改码项。

## Desktop 哪些部分可以保留

- `dsh web --host 127.0.0.1 --port <port> --no-open` 与 `dsh web: <url>` 日志格式仍匹配；现有鉴权 URL 与固定端口启动方式未发现本次破坏性变化。[本地启动器](/Users/jiahaoqian/proj/DSH-Desktop/src/dsh-host.ts:43)、[官方 Web 启动][web-start]。
- `window.dshDesktop` 是本地壳/插件契约；本次未发现需要随 DSH 改名或重写 IPC 的依据。
- 当前 npm + bundled Node 启动默认继续使用 profile link 解析，尚无证据要求改成新版独立可执行文件使用的 runtime resolution。[官方 profile boot][profile-boot]。
- `data-sidebar-right-*` / `data-dockkit-*` 仍存在；标题栏样式主要做新增终端、分屏、全屏和浮层的定向验收，无证据支持整套重写。
- 当前升级器仍是直接在 runtime 目录执行 `pnpm add`，缺少整体数据回滚，这是既有问题。升级执行时应另做一致性备份和隔离副本验证；不能把热更新不回滚与 npm 安装失败恢复混为同一机制。[updateDsh](/Users/jiahaoqian/proj/DSH-Desktop/src/runtime-manager.ts:216)。

## 建议实施顺序与完成条件

1. **准备目标矩阵**：独立分支/隔离依赖环境，固定 0.1.6-alpha.1 的真实包版本；保留当前工作区已有修改。
2. **完成第一批适配**：终端必填字段、桌宠事件、共享依赖/类型、guide.id、Desktop 诊断与插件管理生效状态。
3. **完成契约回归**：类型检查、构建、模块导出检查，以及终端、生命周期、插件管理、侧栏导航等函数/接口测试；回归既有置顶、归档与 Side Chat 功能。
4. **升级准入验证**：隔离 `DSH_HOME` 与插件依赖解析，先检查启动/认证及插件实际激活，再用代表性会话副本验证续写、分叉、附件和恢复。不要让新旧 runtime 同时写真实 home。
5. **再决定主环境升级**：阶段一通过后才运行实际更新；历史读取、MCP 资源能力和插件功能合并可单独排期。

本次完成的是一手 Release/registry/Git 差异与本地接入点的静态核查。未安装目标 runtime、未启动临时或真实服务、未做浏览器 E2E、未修改依赖或产品实现，因此不声称新版运行验收已经通过。

## 一手来源

[registry]: https://registry.npmjs.org/@deepseek-ai%2Fdsh
[release]: https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.6-alpha.1
[compare]: https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.1.5-rc.2...dsh-v0.1.6-alpha.1
[agent]: https://github.com/deepseek-ai/deepseek-harness/blob/0a15e36e7f82b6ed45af6fa9759f29b40dcd965d/packages/core/agent/src/index.ts#L413
[terminal-types]: https://github.com/deepseek-ai/deepseek-harness/blob/0a15e36e7f82b6ed45af6fa9759f29b40dcd965d/packages/subprocess/subprocess/src/types.ts#L225
[terminal-provider]: https://github.com/deepseek-ai/deepseek-harness/blob/0a15e36e7f82b6ed45af6fa9759f29b40dcd965d/packages/subprocess/subprocess-local/src/index.ts#L255
[sidebar-registry]: https://github.com/deepseek-ai/deepseek-harness/blob/0a15e36e7f82b6ed45af6fa9759f29b40dcd965d/packages/client/ui-sidebar-right/src/client/tab-registry.ts#L60
[sidebar-guide]: https://github.com/deepseek-ai/deepseek-harness/blob/0a15e36e7f82b6ed45af6fa9759f29b40dcd965d/packages/client/ui-sidebar-right/src/client/tabs/guide/GuideBody.tsx#L80
[boot]: https://github.com/deepseek-ai/deepseek-harness/blob/0a15e36e7f82b6ed45af6fa9759f29b40dcd965d/packages/boot/app-boot/src/index.ts
[session]: https://github.com/deepseek-ai/deepseek-harness/blob/0a15e36e7f82b6ed45af6fa9759f29b40dcd965d/packages/core/session/src/index.ts#L624
[history-note]: https://github.com/deepseek-ai/deepseek-harness/blob/0a15e36e7f82b6ed45af6fa9759f29b40dcd965d/.agents/notes/implemented/architecture/2026-09-09-deprecate-synchronous-session-event-reads.md
[web-start]: https://github.com/deepseek-ai/deepseek-harness/blob/0a15e36e7f82b6ed45af6fa9759f29b40dcd965d/packages/bundle/web-app/src/index.ts#L271
[profile-boot]: https://github.com/deepseek-ai/deepseek-harness/blob/0a15e36e7f82b6ed45af6fa9759f29b40dcd965d/apps/cli/src/profile-boot.ts#L301
[message-projections]: https://github.com/deepseek-ai/deepseek-harness/blob/0a15e36e7f82b6ed45af6fa9759f29b40dcd965d/.agents/notes/implemented/architecture/2026-09-11-plugin-owned-message-projections.zh.md
[ptc-vocabulary]: https://github.com/deepseek-ai/deepseek-harness/blob/0a15e36e7f82b6ed45af6fa9759f29b40dcd965d/.agents/notes/implemented/architecture/2026-09-12-ptc-runtime-vocabulary.zh.md
[deepseek-config]: https://github.com/deepseek-ai/deepseek-harness/blob/0a15e36e7f82b6ed45af6fa9759f29b40dcd965d/packages/llm/llm-deepseek/src/config.ts#L25
[deepseek-log]: https://github.com/deepseek-ai/deepseek-harness/blob/0a15e36e7f82b6ed45af6fa9759f29b40dcd965d/packages/session/session-log-deepseek/src/index.ts#L37
