# Cua Driver 与 DSH Computer Use 的关系

核查日期：2026-09-15。上游基线为 Cua Driver `v0.28.0`（commit `1b50c02e2d34734f64d2d22f54eb76cc97b4a663`）与 DSH `0.1.6-alpha.1`（commit `0a15e36e7f82b6ed45af6fa9759f29b40dcd965d`）。

## 一句话结论

**Cua Driver 是操作系统级的“眼睛和手”；DSH 是把这双眼睛和手接进 Agent 会话的适配与编排层。**

DSH 没有 fork 或重写 Cua 的截图、无障碍树、窗口发现、点击、键盘、菜单、剪贴板等原生能力。它固定依赖 Cua Driver 0.28.0，发现并调用 Cua 自己的工具目录，再增加工具命名、Agent 生命周期、错误转换、取消、持久化截图、Session 历史和 provider 互斥等 DSH 语义。[Cua 架构][cua-readme] [DSH 设计决策][dsh-decision]

## Cua Driver 是什么

Cua Driver 是 TryCua 项目提供的跨平台 GUI 驱动。核心和平台后端主要用 Rust 实现；对外提供：

- `cua-driver mcp`：面向 Agent 的 MCP stdio 服务。
- `cua-driver <tool> '<json>'`：一次性 CLI 调用。
- `@trycua/cua-driver` 与 Python SDK：通过生成的 UniFFI 绑定，在宿主进程中运行同一原生 runtime。
- 稳定的版本化 C ABI，供嵌入宿主使用。

它本身不是模型，也不负责规划任务。它接收结构化调用，在操作系统层观察或操作真实应用，然后返回文本、结构化结果和图片。[Cua README][cua-readme] [SDK contract][cua-contract]

### 它提供的能力

| 类别 | Cua Driver 能力 |
| --- | --- |
| 发现 | 枚举应用、进程窗口、窗口边界与层叠关系、屏幕大小、光标位置 |
| 观察 | 精确窗口快照、无障碍树、截图、完整桌面截图、权限和健康状态 |
| 语义操作 | 按快照产生的 `element_token` 点击，设置控件值，按原生菜单路径调用菜单 |
| 输入 | 点击、双击、右击、拖动、滚动、输入文本、按键和快捷键 |
| 应用/窗口 | 启动应用、关闭应用、前置窗口、精确设置窗口位置和尺寸 |
| 数据 | 读取和写入剪贴板 |
| 验证 | 对一个精确窗口执行结构化 `verify_state`，把结果分成满足、不满足或未知 |
| 运行辅助 | Cua 生命周期 Session、录制/回放、Agent 光标、配置和浏览器工具（按平台目录提供） |

macOS 实现把这些工具直接注册到平台工具目录；`get_window_state` 同时提供无障碍元素和截图，旧的独立 `screenshot` 已移除。[macOS 工具目录][cua-macos-tools] [Cua 使用规则][cua-skill]

Cua 的一个关键设计是尽量后台操作精确窗口，避免抢走用户焦点：先用语义操作，再用同一快照中的像素坐标；只有明确选择 `delivery_mode: foreground` 才进入前台操作路径。新窗口快照会让旧 `element_token` 失效，调用方需要重新观察。[Cua 使用规则][cua-skill]

## DSH 实际借用了哪些能力

DSH 直接借用的是 Cua 的完整“驱动面”：

1. **平台实现**：macOS Accessibility、Screen Recording、窗口系统和输入注入；Windows/Linux 对应后端。
2. **工具目录和 schema**：工具名、说明、参数和输出格式由 Cua 提供。
3. **原生动作语义**：元素 token、精确窗口目标、后台/前台 delivery、结构化拒绝、验证规则。
4. **截图与结构化结果**：Cua 产生原始 MCP 结果，包括文本、`structuredContent` 和图片字节。
5. **Cua 自己的权限与会话设施**：DSH 不替换操作系统授权和 Cua runtime 的底层策略。

Native provider 直接执行 `CuaDriver.create(undefined)`、`listToolsJson()` 与 `callTool()`；MCP provider 则启动已安装的 `cua-driver mcp`，通过标准 MCP 发现和调用工具。[Native provider][dsh-native] [MCP provider][dsh-mcp]

## DSH 做了哪些独特改变

### 1. 把“驱动”变成 DSH Agent 工具

Native provider 读取 Cua 的工具目录，校验目录形状，然后把每个工具注册进 DSH `ctx.tools`。模型看到的名称改为 `cua_driver_native__<原工具名>`；MCP 方式则使用 `mcp__cua-driver-mcp__<原工具名>`。原始工具名和参数仍原样交给 Cua。

DSH 还约束函数名为 DeepSeek 支持的字符集和 64 字符上限，并拒绝目录中的重复或冲突名称。通用 MCP 桥在名称需要截断或替换时追加身份 hash，避免两个不同工具折叠成同名。[Native provider][dsh-native] [MCP 工具桥][dsh-tool-bridge]

### 2. 把调用写进 DSH Session 历史

Cua 调用经 DSH 的普通 ToolRuntime 执行，所以参数、文本结果、错误和获准进入上下文的图片都会成为 DSH Session 事件。它们随后自然参与会话恢复、模型上下文和压缩。

这是 DSH 集成的主要价值之一：Cua 只负责产生动作与结果，DSH 负责让这些动作成为 Agent 对话中可追踪的一部分。[MCP 工具桥][dsh-tool-bridge]

### 3. 将临时 base64 截图变成持久附件

DSH 对 Cua/MCP 图片做额外的准入：

- 只接受 PNG、JPEG、WebP、GIF 和规范 base64。
- 确认当前 Agent 的模型路由明确声明支持图片输入。
- 通过 DSH attachment store 保存图片，将内联字节替换为持久附件引用。
- 无附件存储、模型不支持图片或图片无效时，模型看到明确诊断；规范原始结果仍保留给程序调用方。

因此 Cua 返回的是“一次工具调用里的图片字节”，DSH 将它提升为“会话里可恢复、可供模型读取的附件”。[图片投影实现][dsh-tool-bridge]

### 4. 增加 provider 独占与有序清理

`dsh-computer-use` 不是通用截图/点击 API。它只保存当前 provider 名称，并确保一个 DSH 组合中只能启用一个 Computer Use provider。切换 Native 与 MCP 前必须先释放旧 provider。

释放时 DSH 先停止工具调用、传播取消、等待在途任务，再关闭 SDK/MCP 连接，最后释放 provider 槽。Native 还会调用 `driver.shutdown()` 和 UniFFI destroy。[Provider registry][dsh-registry] [DSH 设计决策][dsh-decision]

### 5. 把 DSH 的取消信号接到 Cua 生命周期

Native provider 将一次工具调用的取消信号与插件生命周期信号合并；卸载 provider 会中止后续等待，并等待已开始的调用结算。这个取消不能撤销已经送到桌面的点击或键盘输入，因此 DSH 的固定提示词要求取消后重新观察状态。[Native provider][dsh-native]

### 6. 注入适合 Agent 的操作纪律

Native provider 加入一段固定系统提示词，要求模型：

- 先找精确应用和窗口，再获取新快照。
- 使用本次快照的 element token 或坐标。
- 优先后台 delivery；被拒绝不代表可以自动升级到前台操作。
- 动作后重新观察，不能把“点击已送达”当成目标已完成。
- 取消后重新检查，因为已发生的输入不会回滚。
- 记住多个 Session 和其他应用共享同一桌面。

这不是 Cua 的新驱动能力，而是 DSH 为自己的模型循环压缩出的一组调用规则。[Native provider][dsh-native]

### 7. MCP 方式增加连接监督

选择 MCP provider 时，DSH 通用 MCP client 额外负责：

- 清洗传给子进程的环境变量。
- 协议协商、工具分页发现和工具列表变化后的原子替换。
- 单次调用超时、取消和断线指数退避重连。
- 将 MCP server instructions 加入 DSH 系统提示词。
- 在配置了 MCP resources 服务时代理资源列表、模板和读取。

Cua Driver 仍拥有桌面动作，DSH 拥有 MCP 连接代次与模型工具注册。[MCP client][dsh-mcp-client] [server context][dsh-server-context]

## Native 与 MCP 的区别

| | Native provider | MCP provider |
| --- | --- | --- |
| Cua 运行位置 | DSH host 进程内 | 独立 `cua-driver` 进程或 `CuaDriver.app` 服务 |
| 安装 | npm 依赖自带平台二进制 | 需另装 Cua Driver CLI/App |
| 工具名称 | `cua_driver_native__*` | `mcp__cua-driver-mcp__*` |
| 权限身份 | 启动 DSH 的宿主应用 | 可由 `CuaDriver.app` 稳定持有 macOS TCC 权限 |
| 隔离 | 原生崩溃可能终止 DSH host | 驱动故障与 DSH 进程隔离，可由 MCP 监督器重连 |
| 版本 | DSH 固定为 `@trycua/cua-driver@0.28.0` | 取决于外部安装的 driver 版本 |

## DSH 没有改变或尚未实现的部分

- **没有统一 Computer Use 操作 API**：DSH 保留 Cua 自己的工具 schema，没有重新抽象成一套跨 provider 的 click/screenshot 接口。
- **没有把桌面锁给某个 DSH Session**：provider 注册是全局互斥，桌面仍由多个 DSH Session 和其他应用共享；完整工作流需要调用方协调。
- **没有专用权限界面**：Accessibility、Screen Recording 和 macOS TCC 身份仍由部署方式解决。
- **没有动作回滚**：取消只能阻止后续等待，不能撤回已交付的输入。
- **没有把 DSH sandbox/approval 自动映射为 Cua permission mode**：Native 使用 Cua 默认 runtime 配置，MCP 使用外部 driver 的启动配置。两套权限需要分别理解。
- **没有自动加载 Cua 的完整 Skill 工作流**：Native provider 注入的是 DSH 自己的短提示；Cua 随 MCP 提供的 Skill/resource 仍需客户端明确支持和选择。
- **没有保留/恢复桌面状态**：DSH Session 历史会保存工具记录和附件，不会把应用窗口、焦点、Cua element token 或桌面本身恢复到历史状态。
- **DSH 的 Browser Use 是另一条能力线**：官方 Browser Use 选择 Playwright MCP、Chrome DevTools MCP 或 Stagehand。Cua 自己目录中的浏览器工具即使被发现，也不会因此注册成 DSH 的 `browserUse` provider。

## 实际理解方式

可以把调用链看作：

```text
DSH 模型与 Agent 循环
  → DSH ToolRuntime / Session 日志 / 取消 / 附件
    → DSH Cua provider（Native 或 MCP 适配）
      → Cua Driver 工具目录与原生 runtime
        → macOS / Windows / Linux 的窗口、无障碍、截图和输入系统
```

真正独特的分界是：**Cua 负责“怎么可靠地看和动真实桌面”，DSH 负责“哪个 Agent 何时能调用、调用如何进入会话、图片如何持久化、失败和关闭如何收束”。**

## 一手来源

[cua-readme]: https://github.com/trycua/cua/blob/1b50c02e2d34734f64d2d22f54eb76cc97b4a663/libs/cua-driver/README.md
[cua-contract]: https://github.com/trycua/cua/blob/1b50c02e2d34734f64d2d22f54eb76cc97b4a663/libs/cua-driver/contract/README.md
[cua-macos-tools]: https://github.com/trycua/cua/blob/1b50c02e2d34734f64d2d22f54eb76cc97b4a663/libs/cua-driver/rust/crates/platform-macos/src/tools/mod.rs#L889
[cua-skill]: https://github.com/trycua/cua/blob/1b50c02e2d34734f64d2d22f54eb76cc97b4a663/libs/cua-driver/rust/Skills/cua-driver/SKILL.md
[dsh-decision]: https://github.com/deepseek-ai/deepseek-harness/blob/0a15e36e7f82b6ed45af6fa9759f29b40dcd965d/.agents/notes/implemented/architecture/2026-09-12-computer-use-provider-registration.zh.md
[dsh-registry]: https://github.com/deepseek-ai/deepseek-harness/blob/0a15e36e7f82b6ed45af6fa9759f29b40dcd965d/packages/computer-use/computer-use/src/index.ts
[dsh-native]: https://github.com/deepseek-ai/deepseek-harness/blob/0a15e36e7f82b6ed45af6fa9759f29b40dcd965d/packages/experimental/computer-use-cua-driver-native/src/index.ts
[dsh-mcp]: https://github.com/deepseek-ai/deepseek-harness/blob/0a15e36e7f82b6ed45af6fa9759f29b40dcd965d/packages/experimental/computer-use-cua-driver-mcp/src/index.ts
[dsh-tool-bridge]: https://github.com/deepseek-ai/deepseek-harness/blob/0a15e36e7f82b6ed45af6fa9759f29b40dcd965d/packages/mcp/mcp-client/src/tools.ts
[dsh-mcp-client]: https://github.com/deepseek-ai/deepseek-harness/blob/0a15e36e7f82b6ed45af6fa9759f29b40dcd965d/packages/mcp/mcp-client/src/connection.ts
[dsh-server-context]: https://github.com/deepseek-ai/deepseek-harness/blob/0a15e36e7f82b6ed45af6fa9759f29b40dcd965d/packages/mcp/mcp-client/src/server-context.ts
