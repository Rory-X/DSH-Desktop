# DSH Desktop 运行时升级结果：`0.1.7-alpha.2`

执行日期：2026-09-23。升级对象是 `~/.dsh/runtime` 中的 `@deepseek-ai/dsh`；桌面壳 `/Applications/DSH-Desktop.app` 的应用版本未在本次修改。

## 实际状态

- 运行时从 `0.1.6-alpha.2` 升为精确版本 `0.1.7-alpha.2`。Desktop 已重新启动，当前 Web Host 从新运行时启动。
- 依照用户要求，**替换运行时之前先停用 `dsh-workspace-plus`**。Web Profile 中保留 `disabled: true`；`~/.dsh/workspace-plus/pins.json` 与升级前备份 SHA-256 一致。插件自己的会话置顶尚未并入新版 DSH 的原生置顶，暂不启用它，以免出现两套置顶状态。
- 升级前已停用的 `dsh-at-file` 保持停用。该已安装版本仍依赖被上游移除的旧设置接口，不把它算作本次验证通过的启用插件。
- 旧 `settings.yaml` 已导入当前 Web Profile 的插件 Config，原文件保留为 `settings.yaml.imported`。`r-mode` 与 `ptc-workflow` 已迁移为声明式 Agent preset；隔离 Host 的 preset 列表 RPC 确认两者已注册且未标记损坏。
- Web Profile 的五个官方实验包对齐目标版；`dsh-desktop-update` 指向已适配的源码插件；修正 `dsh-synapse` 的安装链接。`dsh-status-rotator` 配置与升级前一致。
- `dsh-tencent` 对新版 Cordis 和流式接口做适配，重新构建并部署 `dsh-token-meter`、`dsh-compaction-basic`、`dsh-llm-pi-ai` 的目标版核心补丁；部署后的 SHA-256 与 staging 记录一致。

## 插件改动与验证

| 范围 | 结果 |
| --- | --- |
| `DSH-Plugs` | 共享 runtime 移除旧 client/runtime 类型与设置注册接口，插件设置改用新的 Config 与配置表单；Codex 侧聊适配新版 Session、待发消息和发送入口；通知跳转改用新的 Session/Workspace 服务。14 个启用插件包完成构建，依赖契约、客户端模块与整个工作区类型检查通过；仓库全量测试命令通过。`workspace-plus` 也已构建与测试，但按要求保持停用。 |
| `dsh-tencent` | 类型检查、Host/Client 构建和全量测试通过。补修 Cursor HTTP/2 重置错误的事件顺序：重置原因现在能到达 JSON、SSE 和追踪日志，同时不完整的正常 EOF 仍会及时失败。MCP 发现测试同步了实际返回的 `connected` 状态。 |
| 隔离启动 | 目标运行时与插件在独立 Profile 启动；Web 页面及 Tencent 代理、Desktop 更新器、Quick Notes、Whale Girl、Session Archive 的路由正常。新客户端模块加载检查无控制台错误。 |
| 实际 Desktop | 重新启动后，运行时包版本为 `0.1.7-alpha.2`；Tencent 代理状态接口与 Synapse 页面、脚本均返回 HTTP 200。Web 根路径在未认证请求下返回 401，符合预期。 |

备份位于 `/Users/jiahaoqian/DSH-Backups/2026-09-23-dsh-0.1.7-alpha.2-preupgrade`，包括升级前 `~/.dsh`、原运行时、配置与预设、分阶段运行时和测试日志。备份目录权限为 `700`。由于新版 Session 使用 V4 格式，若以后回退旧运行时，应以这份升级前数据为基准处理会话，不能仅替换 npm 包。

本次未执行真实模型请求；验证覆盖插件构建、单元/集成测试、隔离启动和 Desktop 的本机服务。用户明确要求的 `workspace-plus` 停用状态将保持，直到另行决定如何合并原生会话置顶。
