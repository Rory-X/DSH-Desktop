# DSH `0.1.6-alpha.2` → `0.1.7-alpha.2` 上游升级调查

> 本文记录升级前的调查与当时的状态，供追溯兼容性依据。2026-09-23 已完成实际升级；执行内容和验证结果见[升级结果](./dsh-0.1.7-alpha.2-upgrade-result-2026-09-23.md)。下文“当前”“尚未安装”等措辞均指升级前的调查快照。

核查日期：2026-09-23。本文针对 npm 运行时 `@deepseek-ai/dsh`，不等同于本仓库桌面壳的版本升级。以官方 Git 标签 `dsh-v0.1.6-alpha.2`（`ddefc45fbc7f8e46dd73185e68295696d1297887`）和 `dsh-v0.1.7-alpha.2`（`00102833dfaee1da9f48a3a8eae9d34005a75218`）为边界；中间包含 `dsh-v0.1.7-alpha.1`。npm 已发布目标包；核查时 npm `alpha=0.1.7-alpha.2`，但 `latest=0.1.5-rc.2`、`next=0.1.5-rc.3`。因此安装目标版本应使用精确版本或 `alpha` 渠道，不能把 `latest` 当作本次目标。[npm 注册表][npm] [官方标签比较][compare]

## 对日常使用的变化

- **会话和侧栏：** 会话支持置顶、归档、筛选和恢复；运行中的会话归档会先列出受影响的回合、子代理、后台任务和提醒。工作过程组可折叠，长会话加载、历史分页和滚动跟随有改善；alpha.2 继续修复发送瞬间重复显示和服务重启后 Web 页面看似已连接却不显示回复的问题。[alpha.1 发布说明][release-1] [alpha.2 发布说明][release-2]
- **文件和插件：** 文件改动审阅默认双栏并支持高亮、同步滚动；Excel 预览覆盖 XLSX、XLS、CSV、TSV，PDF、Office 和图片统一缩放。插件安装可选择 npm 源，未配置源时 alpha.2 会寻找可访问源；不可读取的可选组合包不再直接中止整个 Profile 加载，插件页保留诊断和禁用、移除操作。[alpha.1 发布说明][release-1] [alpha.2 发布说明][release-2]
- **Agent 与模型：** 首次安装自动创建默认工作区和空白会话；后台命令和工作流能力增强，alpha.2 修复连续后台任务完成后 Agent 停住的问题。官方 DeepSeek 适配器只走 Messages API；模型发现列表显示可读名称。[alpha.1 发布说明][release-1] [alpha.2 发布说明][release-2]

## 插件兼容性：按使用情况检查

| 范围 | 上游事实 | 需要适配的插件或配置 |
| --- | --- | --- |
| Session 日志 V4 | 写入格式从 V3 升为 V4。历史 V3 工具结果从 `role: 'user'` 加 `tool-result` 内容包装，迁为 `role: 'tool'`、顶层 `toolCallId`、可选 `isError`；旧 `source.plugin` 经映射成为生产者拥有的 `source.kind`，未知内容类型进入 `plugin:` 命名空间。原生 V4 严格校验；旧 V3 读取方拒绝较新的 generation。 | **直接读写 Session JSONL、解释 `tool/result`、消息来源、内容块，或自行实现历史回放的插件须迁移。** 仅通过当前版本 Session API 读取逻辑事件的插件应检查自己是否假设 V3 的消息形状。V3 只读打开会在内存里转换；写打开会在原文件旁发布 V4 后继，原文件不改写。回退旧运行时时，被写成 V4 的会话可能无法打开，升级前要保留完整会话数据备份。[V4 格式变更][v4-change] [迁移包说明][v4-migrate] [JSONL 存储说明][jsonl] |
| 自定义事件里的附件 | 内置附件读取与 ZIP 导出只检查声明过的内容载体；仅保存在自定义事件载荷中的附件引用不会自动读出或导出，日志文本仍保留。 | **把图片或文件引用只写在自定义事件中的插件必须改用受支持的内容位置，或自己提供读取器。** 不要把“日志里还有引用”当作“附件字节仍能导出”。[alpha.1 发布说明][release-1] [附件载体决策][attachment] |
| `workspaceFiles` Remote | `readAll`、`readRelated` 删除，统一为 `readBytes(sessionId, path, { range?, baseFile? }, signal)`；`readBytes` 的 `data` 从 base64 字符串变成 `Uint8Array`；`changes` 新增目标 `path` 参数，监听可以是文件或目录。无 `range` 的 `{}` 读取完整文件，有 `range: {}` 才是默认字节窗口。 | **直接调用 `remote.workspaceFiles` 的 Client 插件必须迁移签名与字节解码逻辑。** 旧 `readAll(s,p,signal)` 对应 `readBytes(s,p,{},signal)`；旧 `readRelated(s,base,relative,signal)` 对应 `readBytes(s,relative,{baseFile:base},signal)`；旧范围读取对应 `{range: oldRange}`。结果的 `data` 不再需要 base64 解码。[新版文件服务说明][files] [固定标签源码比较][files-diff] |
| 设置 | 设置改由当前 Profile 的插件 Config 与 `cordis.patch.yml` 拥有；旧 `$DSH_HOME/settings.yaml` 在启动时尝试导入一次，并重命名为 `settings.yaml.imported`。表单展示 `.volatile()` 声明的字段，插件运行时以 `config.field.get()` 读取即时值。 | **自行读写 `settings.yaml` 或暴露自定义设置页的插件须迁移。** 要给 Profile 条目稳定且唯一的 id；未声明为 volatile 的字段仍通过 Cordis 配置编辑，不在即时表单内。[alpha.1 发布说明][release-1] [设置包说明][settings] [设置卡片指南][settings-guide] |
| Agent preset | 旧目录扫描式 `dsh-agent-presets` 改为 `dsh-agent-preset-registry` 加 `dsh-agent-preset` 插件行声明，预设可由 bundle patch 安装或覆盖。旧目录预设不再直接提供定义。 | **若在 `~/.dsh/.agent-presets` 或类似目录放了自定义 preset，必须迁为 bundle patch；其所依赖的插件包亦需出现在新组合。** 使用内置 `standard`、`ptc`、`minimal`、`cordis` 预设的用户不必手工重建。[alpha.1 发布说明][release-1] [预设注册表][preset-registry] [预设声明][preset] |
| DeepSeek 官方适配器 | `dsh-llm-deepseek` 移除 `protocol` 选择，只支持 Messages；默认根为 `https://api.deepseek.com/anthropic`。其他自定义提供商仍可选择 OpenAI Chat Completions、OpenAI Responses 或 Anthropic Messages。 | **若 Profile 配了 `llm-deepseek.protocol: chat-completions` 或经只支持 Chat Completions 的网关访问 DeepSeek，需删除此字段并换 Messages 兼容地址，或改用自定义模型 API。** [alpha.1 发布说明][release-1] [DeepSeek 包文档][deepseek] [提供商指南][providers] |
| `spill-policy`（alpha.2 新增） | `maxInlineBytes` 删除，改为 `maxInlineTokens`，单位从 UTF-8 字节改成估算 token；文本与图片共用预算。官方示例把旧 `50000` 字节改为 `12500` token，但这只是示例值，须按实际输出需求设置。省略新字段会禁用该策略。 | **若自定义 patch 写了 `maxInlineBytes`，必须改名并重新评估阈值。** 旧键不应继续保留；其余插件若只使用默认组合，无需改配置。[alpha.2 发布说明][release-2] [策略文档][spill] |

## 其他与插件开发有关的变化

- 组合包 `dsh.bundle.patch` 可以按顺序声明多个 patch 文件，旧单文件形式继续有效；插件可以把无需重新加载的配置字段声明为 volatile，相关修改会保留运行中的插件实例。[alpha.1 发布说明][release-1] [App Boot 说明][boot]
- 插件可声明多语言名称、描述和 `package.json` 图标，供插件页展示。这是新增能力，不是旧插件运行的前置条件。`dsh --dump-config-schema` 可导出配置 JSON Schema，辅助检查 patch。[alpha.1 发布说明][release-1]
- alpha.2 把 Cordis 等 vendor 包与 Node Addon System 的自动依赖更新范围收窄到同一小版本的补丁。标签间 Cordis 包版本从 `4.0.2` 到 `4.0.4`；插件若强行绑定另一份 Cordis 或把旧内部包版本写死，应针对已安装 Profile 检查实际依赖解析。[alpha.2 发布说明][release-2] [vendor 包清单][cordis-package]

## 本机 Desktop 与 DSH-Plugs 命中情况

核查的是 **2026-09-23 当前工作树**，其中 Desktop 和相邻的 `DSH-Plugs` 都有此前已存在的未提交改动；这里只读取，不覆盖。实际安装的 `~/.dsh/runtime/node_modules/@deepseek-ai/dsh/package.json` 为 `0.1.6-alpha.2`。Web Profile 中的主要自定义插件通过 `link:` 指向 `../DSH-Plugs`，但 `dsh-desktop-update` 指向 `~/.dsh/plugins/desktop-update` 的独立副本；该副本也仍使用旧设置接口。

| 优先级 | 当前代码/数据证据 | 实际影响与适配 |
| --- | --- | --- |
| **P0：设置服务接口** | 0.1.7 的 [`SettingsForms`][settings-source] 已无 `register()`/`SettingsScope.get()`/`watch()`。本地 [`dsh-codex`](/Users/jiahaoqian/proj/DSH-Plugs/plugins/dsh-codex/src/index.ts)、[`dsh-quick-notes`](/Users/jiahaoqian/proj/DSH-Plugs/plugins/dsh-quick-notes/src/index.ts)、[`dsh-whale-girl`](/Users/jiahaoqian/proj/DSH-Plugs/plugins/dsh-whale-girl/src/index.ts) 通过旧 `installSettingsSection` 接入；[`dsh-desktop-update`](/Users/jiahaoqian/proj/DSH-Plugs/plugins/dsh-desktop-update/src/index.ts)、[`dsh-model-custom-ex`](/Users/jiahaoqian/proj/DSH-Plugs/plugins/dsh-model-custom-ex/src/index.ts)、[`dsh-workspace-plus`](/Users/jiahaoqian/proj/DSH-Plugs/plugins/dsh-workspace-plus/src/index.ts) 直接调用 `ctx.settings.register`。已安装的第三方 [`dsh-at-file`](/Users/jiahaoqian/.dsh/profiles/web/node_modules/dsh-at-file/lib/index.js) 也在 `apply()` 中直接调用 `ctx.settings.register`，会在加载时触发失败。共享 runtime 的 [`host.ts`](/Users/jiahaoqian/proj/DSH-Plugs/packages/runtime/src/host.ts) 仍从旧 `dsh-settings` 导出 `installSettingsSection`、`settingsNamespace`、`SettingsProvider`，目标包已不再导出这些名字；其官方包依赖仍固定在 `0.1.1-rc.2`。 | 共享 runtime 必须先改造并对目标版重新构建，否则按目标包解析时会出现缺失导出；直接调用 `register()` 也会失败。把设置改成插件导出的 Cordis `Config`，可实时编辑的字段声明 `.volatile()`，通过 `config.field.get()` 取值；删除旧注册调用。`dsh-at-file` 需等待兼容发布或维护本地适配版。[设置卡片指南][settings-guide] |
| **P0：客户端设置接口** | 0.1.7 的 [`ui-settings` diff][settings-client-diff] 把 `ctx.settingsScope` 替换成 `ctx.configForms`，`bind()` 改为 `get(entryId)`。共享 [`client.ts`](/Users/jiahaoqian/proj/DSH-Plugs/packages/runtime/src/client.ts) 和 `dsh-codex`、`dsh-desktop-update`、`dsh-model-custom-ex`、`dsh-quick-notes`、`dsh-whale-girl` 的 Client 半侧仍注入或使用 `settingsScope`。 | 对应插件设置页/设置读取会因缺服务而失效。尤其 `dsh-model-custom-ex` 的 patch 还禁用了官方模型设置页；须先迁移其自定义模型页面再启用新版。`settings.section` slot 本身仍存在，其他只用该 slot 的页面不因这个接口单独失效。 |
| **P0：一次性设置导入** | 当前 `~/.dsh/settings.yaml` 包含 `dsh-codex`、`desktop-update`、`whale-girl`、`dsh-model-custom-ex`、`quick-notes` 等节。目标版在逐项导入前**先改名为** `settings.yaml.imported`，导入失败只写日志，不重试；映射表只特殊处理 `ui-developer-tools`、`ui-onboarding`、`shell`。[固定源码][settings-source] 本地 `quick-notes`/`whale-girl` 的旧节名与 Profile 条目 id `dsh-quick-notes`/`dsh-whale-girl` 不同。 | 如果未经适配直接首启，插件偏好可能回到默认值。升级前保存 `settings.yaml` 和 Profile 补丁，并明确把自定义节迁到相应条目的 Config；首启后逐项核对。`.imported` 保留原内容，可用于人工恢复。 |
| **P0：自定义 Agent preset** | 本机有 `~/.dsh/.agent-presets/r-mode`、`ptc-workflow` 两个目录型预设。目标版改为声明式插件组合；已有 Session 仍按保存的 preset id 查当前注册表。[预设决策][preset-decision] | 迁移两个预设到 Profile/bundle patch，并确认已有 Session 能用对应 id 恢复。当前默认预设为 `standard`，所以新会话默认模式不受这两个目录消失直接影响。 |
| **P0：官方实验插件版本** | Web Profile 的 `@deepseek-ai/dsh-browser-use`、`dsh-computer-use` 及三个 Playwright/CUA 实验包都固定在 `0.1.6-alpha.1`。已安装包的 peer 范围是 `^0.1.6-alpha.1`；上游目标标签与 npm 均有这五个包的 `0.1.7-alpha.2` 版本。 | 核心升级时把五个 Profile 依赖一同对齐到 `0.1.7-alpha.2`，检查 `cordis.patch.yml` 的浏览器/电脑操作插件仍加载。旧预发行版 peer 范围不覆盖目标预发行版，混用存在依赖解析和运行时兼容风险。 |
| **P1：配置同步** | [`dsh-sync` 的 payload](/Users/jiahaoqian/proj/DSH-Plugs/plugins/dsh-sync/src/payload.ts) 引用上述已移除的 `SettingsProvider`、`settingsNamespace` 导出。新版 `describe()`/`replace()` 方法本身仍在，但 `describe()` 只列出有 `.volatile()` 字段的 Profile 条目，`replace()` 只替换这些即时字段；[`profile-sync.ts`](/Users/jiahaoqian/proj/DSH-Plugs/plugins/dsh-sync/src/profile-sync.ts) 又单独同步整个 patch。 | 先修复类型与导出，再设计同步边界：确保一次拉取不会因「设置节」和「Profile patch」两次写入覆盖或重复应用，也要处理旧云端 payload 的节名。当前语义下旧设置节可能被跳过，或 `replace()` 被无 volatile 字段的条目拒绝；需做双设备往返验证。 |
| **P1：状态轮播插件** | 已安装的 [`dsh-status-rotator`](/Users/jiahaoqian/.dsh/profiles/web/node_modules/dsh-status-rotator/lib/index.js) 检测不到旧 `settings.register` 后会静默回退到自己的 `config.json` 读写；当前 `settings.yaml` 里有 `status-rotator` 节。 | 核对原偏好是否已在插件的独立配置文件中；否则升级后可能显示默认配置。这一路径不会像 `dsh-at-file` 那样直接抛出加载异常。 |
| **P1：会话 V4 的读取逻辑** | [`dsh-synapse`](/Users/jiahaoqian/proj/DSH-Plugs/plugins/dsh-synapse/index.js) 和 [`dsh-workspace-plus` 导出](/Users/jiahaoqian/proj/DSH-Plugs/plugins/dsh-workspace-plus/src/session-export.ts) 直接解释逻辑事件中的 `tool/result` 和序号；`dsh-session-archive` 也遍历历史事件。 | 需要用 V3 迁移后的逻辑事件和新生 V4 会话各验证一次卡片、工具结果、归档列表与 Markdown 导出。已看到部分解析代码可接受新扁平 `content`，因此这是**待验证项**，不是已证明的故障。`dsh-debug-mode` 的自定义事件只存布尔值；`dsh-quick-notes` 的图片保存在独立目录，未发现“仅在自定义 Session 事件里留附件引用”的命中。 |
| **P1：自定义归档入口** | [`dsh-workspace-plus` 的菜单](/Users/jiahaoqian/proj/DSH-Plugs/plugins/dsh-workspace-plus/src/client/session-commands.ts) 直接调用 `uiWorkspace.archiveSession(id)`；新版该方法对有运行中工作的 Session 会抛 `workspace/session-active`，上游侧栏在专属回调里捕获它并弹出“停止并归档”确认。[上游归档回调][archive-callback] | 自定义菜单没有该捕获与确认，运行中 Session 的归档会失败；其调用方还用 `void run(...)` 丢弃拒绝结果。让自定义菜单复用或实现同样的确认流程，保留对运行中工作清单的告知。静止 Session 的归档路径仍可用。 |
| **P1：两套会话置顶状态** | 原生置顶通过 `uiWorkspace.pinSession()` 写入 Workspace 的 `pinnedSessionIds`，使会话在所属工作区和平铺视图的置顶块靠前，并提供原生菜单及悬停按钮。[原生置顶动作][pin-action] [排序实现][pin-order] `workspace-plus` 的 [`setPin()`](/Users/jiahaoqian/proj/DSH-Plugs/plugins/dsh-workspace-plus/src/client/features.ts) 则写入 `~/.dsh/workspace-plus/pins.json` 并由 [`PinnedSection`](/Users/jiahaoqian/proj/DSH-Plugs/plugins/dsh-workspace-plus/src/client/PinnedSection.tsx) 在侧栏注入跨工作区快捷副本，不调用原生接口。当前该文件有 **7 条会话置顶、1 条工作区置顶**；插件的 `sessionPin` 菜单默认开启。 | 不会发生两个组件同时改同一份数据的覆盖冲突，但会出现两个不同的“置顶”状态：原生取消后插件快捷入口仍在，插件取消后原生置顶仍在；同一会话可在顶部快捷区和原生列表前排同时出现，菜单文字可能互相矛盾。建议把原生 `pinnedSessionIds` 作为**会话置顶的唯一状态**，一次性导入这 7 条会话记录；若仍需要跨工作区快捷入口，可让 `PinnedSection` 从原生集合派生，并让其取消按钮调用 `uiWorkspace.unpinSession()`。插件独有的**工作区置顶**仍保留独立存储。仅关闭 `sessionPin` 菜单开关不会清掉现有快捷入口。 |
| **无需因本次改动迁移的接口/配置** | 当前 Plugs 源码未调用 `remote.workspaceFiles.readAll/readRelated/changes`；`dsh-codex` 的 `ctx.fs.readBytes` 是不同的 Host API。当前插件源码和 Web Profile patch 未出现 `maxInlineBytes`/`spill-policy`；本机 `settings.yaml` 未见 `protocol:` 配置。Desktop 的 [`dsh-host.ts`](/Users/jiahaoqian/proj/DSH-Desktop/src/dsh-host.ts) 使用的 `web --host --port --no-open` 参数在标签间 CLI 参数 diff 中未被删除。 | 不需要针对这些点改现有插件或桌面启动参数，但这不替代新版启动和关键流程验证。[CLI 参数差异][cli-diff] |

**补充交互检查：** [`dsh-session-archive` 的自动确认器](/Users/jiahaoqian/proj/DSH-Plugs/plugins/dsh-session-archive/src/client/sidebar-archive.ts) 用旧标题正则寻找归档弹窗。新版活动会话弹窗标题为“停止并归档此会话？”/“Stop and archive this session?”，均不匹配该正则，因此新版的停止确认预计仍需用户手动操作；这符合上游新行为，但插件 README 所说的“一键归档”需更新说明。[新版弹窗源码][archive-dialog] [文案][archive-locales]

**`dsh-tencent` 的核心补丁：** 它的 [`stage-dsh-compaction-core.mjs`](/Users/jiahaoqian/proj/dsh-tencent/scripts/stage-dsh-compaction-core.mjs) 对 `dsh-token-meter`、`dsh-compaction-basic`、`dsh-llm-pi-ai` 三个已安装产物做锚点补丁。把 npm 已发布的 `0.1.7-alpha.2` 三个包单独下载到临时目录后，用该脚本导出的 `patchCoreSource()` 对每个目标包的 `lib/index.js` 检查，结果均为 **patchable**；没有改真实 runtime。说明目标产物仍能按现有脚本生成补丁，但升级安装会覆盖旧补丁，发布流程仍须重新 stage、校验和部署，不能只更新核心包。[项目操作说明](/Users/jiahaoqian/proj/dsh-tencent/README.md)

**用户确定的升级顺序（2026-09-23）：如果更新 DSH，先停用 Web Profile 中的 `@just-genius/dsh-workspace-plus` 插件。** 停用时保留 `~/.dsh/workspace-plus/pins.json` 等现有数据，后续如要恢复跨工作区快捷入口再决定是否迁移到原生会话置顶。此决定取代上文“升级前必须完成 workspace-plus 会话置顶适配”的建议；当前并未停用插件。

**其他升级门槛：** 先迁移共享 runtime 与其他插件的设置 Host/Client、两个 preset、五个官方实验插件版本，并取得 `dsh-at-file` 兼容实现，核对设置导入映射；再用隔离 Profile 构建并启动已启用插件、验证同步和 Session V4 阅读路径，重新 stage `dsh-tencent` 核心补丁。由于 Desktop 更新器直接对共享 runtime 执行 `pnpm add`，其安装与 Session V4 发布不构成一键可逆切换，正式升级前应停止 DSH 并保留 `~/.dsh` 的一致性快照。此次没有执行安装、重启或修改真实 Profile。

## 核查边界

本报告依据官方发布说明、固定 Git 标签间的源码与文档、npm 包元数据；尚未安装目标运行时，也未对本机 Profile、插件仓库或真实会话做端到端运行验证。上述表格是**上游兼容性清单**，不代表每项都命中当前用户插件；需结合当前插件调用点逐项判定。官方仓库提供开发者用批量 V4 迁移脚本 `pnpm run migrate:sessions-to-v4`，它是源码 checkout 的一次性 contributor 命令，不是 npm 安装版 CLI 的普通升级步骤。[迁移脚本][v4-script] [JSONL 存储说明][jsonl]

[npm]: https://registry.npmjs.org/@deepseek-ai%2Fdsh
[compare]: https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.1.6-alpha.2...dsh-v0.1.7-alpha.2
[release-1]: https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.7-alpha.1
[release-2]: https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.7-alpha.2
[v4-change]: https://github.com/deepseek-ai/deepseek-harness/blob/00102833dfaee1da9f48a3a8eae9d34005a75218/docs/persistence-changes/2026-09-16-session-format-v4.zh.md
[v4-migrate]: https://github.com/deepseek-ai/deepseek-harness/blob/00102833dfaee1da9f48a3a8eae9d34005a75218/packages/session/session-format-v3-to-v4/README.zh.md
[jsonl]: https://github.com/deepseek-ai/deepseek-harness/blob/00102833dfaee1da9f48a3a8eae9d34005a75218/packages/session/session-persistence-jsonl/README.zh.md
[attachment]: https://github.com/deepseek-ai/deepseek-harness/blob/00102833dfaee1da9f48a3a8eae9d34005a75218/.agents/notes/implemented/bug-fix/2026-09-19-declared-session-attachment-carriers.zh.md
[files]: https://github.com/deepseek-ai/deepseek-harness/blob/00102833dfaee1da9f48a3a8eae9d34005a75218/packages/api/workspace-files/README.zh.md
[files-diff]: https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.1.6-alpha.2...dsh-v0.1.7-alpha.2
[settings]: https://github.com/deepseek-ai/deepseek-harness/blob/00102833dfaee1da9f48a3a8eae9d34005a75218/packages/settings/settings/README.zh.md
[settings-guide]: https://github.com/deepseek-ai/deepseek-harness/blob/00102833dfaee1da9f48a3a8eae9d34005a75218/docs/cookbook/adding-a-settings-card.zh.md
[preset-registry]: https://github.com/deepseek-ai/deepseek-harness/blob/00102833dfaee1da9f48a3a8eae9d34005a75218/packages/preset/agent-preset-registry/README.zh.md
[preset]: https://github.com/deepseek-ai/deepseek-harness/blob/00102833dfaee1da9f48a3a8eae9d34005a75218/packages/preset/agent-preset/README.zh.md
[deepseek]: https://github.com/deepseek-ai/deepseek-harness/blob/00102833dfaee1da9f48a3a8eae9d34005a75218/packages/llm/llm-deepseek/README.zh.md
[providers]: https://github.com/deepseek-ai/deepseek-harness/blob/00102833dfaee1da9f48a3a8eae9d34005a75218/docs/user/guide/providers.zh.md
[spill]: https://github.com/deepseek-ai/deepseek-harness/blob/00102833dfaee1da9f48a3a8eae9d34005a75218/packages/spill/spill-policy/README.zh.md
[boot]: https://github.com/deepseek-ai/deepseek-harness/blob/00102833dfaee1da9f48a3a8eae9d34005a75218/packages/boot/app-boot/README.zh.md
[cordis-package]: https://github.com/deepseek-ai/deepseek-harness/blob/00102833dfaee1da9f48a3a8eae9d34005a75218/vendor/cordis/package.json
[v4-script]: https://github.com/deepseek-ai/deepseek-harness/blob/00102833dfaee1da9f48a3a8eae9d34005a75218/scripts/migrate-sessions-to-v4.ts
[settings-source]: https://github.com/deepseek-ai/deepseek-harness/blob/00102833dfaee1da9f48a3a8eae9d34005a75218/packages/settings/settings/src/index.ts
[settings-client-diff]: https://github.com/deepseek-ai/deepseek-harness/blob/00102833dfaee1da9f48a3a8eae9d34005a75218/packages/client/ui-settings/src/client/index.ts
[preset-decision]: https://github.com/deepseek-ai/deepseek-harness/blob/00102833dfaee1da9f48a3a8eae9d34005a75218/.agents/notes/implemented/architecture/2026-09-18-declarative-agent-presets.zh.md
[cli-diff]: https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.1.6-alpha.2...dsh-v0.1.7-alpha.2
[archive-dialog]: https://github.com/deepseek-ai/deepseek-harness/blob/00102833dfaee1da9f48a3a8eae9d34005a75218/packages/client/ui-workspace/src/client/session-actions/ArchiveSession.tsx
[archive-callback]: https://github.com/deepseek-ai/deepseek-harness/blob/00102833dfaee1da9f48a3a8eae9d34005a75218/packages/client/ui-workspace/src/client/index.ts
[archive-locales]: https://github.com/deepseek-ai/deepseek-harness/blob/00102833dfaee1da9f48a3a8eae9d34005a75218/packages/client/ui-workspace/src/client/locales.ts
[pin-action]: https://github.com/deepseek-ai/deepseek-harness/blob/00102833dfaee1da9f48a3a8eae9d34005a75218/packages/client/ui-workspace/src/client/session-actions/PinSession.tsx
[pin-order]: https://github.com/deepseek-ai/deepseek-harness/blob/00102833dfaee1da9f48a3a8eae9d34005a75218/packages/client/ui-workspace/src/client/pin-order.ts
