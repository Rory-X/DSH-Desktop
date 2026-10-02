# DSH 0.1.6-alpha.1：启用 Browser Use 与 Computer Use

核查日期：2026-09-15。依据官方 `dsh-v0.1.6-alpha.1` 固定提交 `0a15e36e7f82b6ed45af6fa9759f29b40dcd965d` 和 npm 已发布包。本文只说明配置，没有修改本机 profile、安装包或启动服务。

## 结论

两个能力都是实验性、默认关闭。每项都需要安装一个共享能力包和一个 provider，然后在 Web profile 的配置层显式挂载。

- Browser Use 三选一：Playwright MCP、Chrome DevTools MCP、Stagehand Native。
- Computer Use 二选一：Cua Driver Native、Cua Driver MCP。
- Browser Use 与 Computer Use 属于不同注册槽，可以同时启用。
- provider 在启动或重载后不会接管已经活动的 Session；重启 Web host 后新建或重新打开 Session 才会获得工具。

## 推荐起步组合

先用 Playwright MCP 启动独立 Chromium；Computer Use 先用 Native 做短期验证。macOS 日常使用若需要稳定的权限身份，可以改为安装 `CuaDriver.app` 后使用 MCP provider。

### 1. 安装 Web profile 依赖

先将 DSH runtime 升级到 `0.1.6-alpha.1`，然后停止 DSH-Desktop，再执行：

```sh
dsh plugin --profile web add \
  @deepseek-ai/dsh-browser-use@0.1.6-alpha.1 \
  @deepseek-ai/dsh-experimental-browser-use-playwright-mcp@0.1.6-alpha.1 \
  @deepseek-ai/dsh-computer-use@0.1.6-alpha.1 \
  @deepseek-ai/dsh-experimental-computer-use-cua-driver-native@0.1.6-alpha.1
```

本机若没有全局 `dsh`，可使用当前 runtime 的入口：

```sh
~/.dsh/runtime/node_modules/.bin/dsh plugin --profile web add <上述包名>
```

这些 provider 不是 bundle 包；CLI 可能提示依赖没有 bundle patch。依赖仍会保留，后续由用户 patch 显式挂载，这是预期行为。

### 2. 配置 Web profile

把以下 patch 追加到 `~/.dsh/profiles/web/cordis.patch.yml`。现有内容需要保留。

```yaml
- insert:
    - id: browser-use
      name: '@deepseek-ai/dsh-browser-use'

    - id: browser-use-playwright
      name: '@deepseek-ai/dsh-experimental-browser-use-playwright-mcp'
      config:
        mode: launch
        headless: false
        executablePath: /Applications/Google Chrome.app/Contents/MacOS/Google Chrome

    - id: computer-use
      name: '@deepseek-ai/dsh-computer-use'

    - id: computer-use-cua-native
      name: '@deepseek-ai/dsh-experimental-computer-use-cua-driver-native'
```

`headless: false` 便于第一次观察浏览器；确认后可改成 `true`。如果没有 Google Chrome，删除 `executablePath` 让上游发现 Chromium，或填实际 Chromium 路径。

### 3. 检查并启动

配置 dump 不会启动服务：

```sh
dsh --profile web --dump-config
```

确认输出含四个自定义 id 后，重新启动 DSH-Desktop。必须新建 Session，或在重启后重新打开已有 Session。可分别测试：

- “用浏览器打开 `https://example.com`，读取标题并截图。”
- “用 computer use 检查当前桌面权限并列出窗口，不要点击或输入。”

Playwright 工具名以 `mcp__playwright-mcp__` 开头；Native Cua Driver 工具名以 `cua_driver_native__` 开头。

## Browser Use 的其他 provider

同一时刻只挂载下面三个 provider 中的一个，共享的 `browser-use` 行保留。

### Chrome DevTools MCP

适合 DevTools、网络与性能诊断。把 Playwright 包替换为：

```sh
dsh plugin --profile web remove @deepseek-ai/dsh-experimental-browser-use-playwright-mcp
dsh plugin --profile web add @deepseek-ai/dsh-experimental-browser-use-chrome-devtools-mcp@0.1.6-alpha.1
```

并将 provider 配置改为：

```yaml
- id: browser-use-chrome-devtools
  name: '@deepseek-ai/dsh-experimental-browser-use-chrome-devtools-mcp'
  config:
    mode: launch
    headless: false
    executablePath: /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
```

工具名以 `mcp__chrome-devtools-mcp__` 开头。

### 连接已有 Chromium

Playwright 和 Chrome DevTools provider 都支持 attach。先用独立用户目录启动 Chrome 的调试端口，再把 provider 配置改为：

```yaml
config:
  mode: attach
  endpoint: http://127.0.0.1:9222
```

attach 连接在当前 DSH provider 实例内只供一个活动 Session 使用。释放 Session 时 DSH 只断开连接，不会关闭外部 Chrome。浏览器的登录状态不会从 Session 日志恢复。

### Stagehand Native

Stagehand 提供 `stagehand_navigate`、`stagehand_act`、`stagehand_observe`、`stagehand_extract`、截图和标签页工具。它必须单独配置模型和 API key；不会复用 DSH 的 Session 模型或凭据，并且当前不支持 DeepSeek endpoint 或 `baseURL` 覆盖。

安装：

```sh
dsh plugin --profile web add \
  @deepseek-ai/dsh-browser-use@0.1.6-alpha.1 \
  @deepseek-ai/dsh-experimental-browser-use-stagehand-native@0.1.6-alpha.1
```

配置示例：

```yaml
- insert:
    - id: browser-use
      name: '@deepseek-ai/dsh-browser-use'
    - id: browser-use-stagehand
      name: '@deepseek-ai/dsh-experimental-browser-use-stagehand-native'
      config:
        mode: launch
        headless: false
        executablePath: /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
        model:
          modelName: openai/gpt-5.4-mini
          apiKey: !!js process.env.OPENAI_API_KEY
```

可将 `OPENAI_API_KEY` 放在 DSH 启动时会加载的环境层，例如 `$DSH_HOME/.env`，不要把密钥明文提交到仓库。

## Computer Use 的两个 provider

### Native：安装最少

上面的推荐配置使用 npm 中固定的 `@trycua/cua-driver@0.28.0` 和对应平台可选二进制，不需要单独安装 CLI。它与 DSH host 同进程；原生模块崩溃可能带走 host。

macOS 需要向启动 DSH 的应用授予 Accessibility 和 Screen Recording 权限。Desktop 场景先在“系统设置 → 隐私与安全性”中为 DSH-Desktop 授权，然后重启应用。授权主体若无法稳定归属到 Desktop，改用下面的 MCP 方式和 `CuaDriver.app`。

权限只读检查工具是 `cua_driver_native__check_permissions`，参数使用 `{ "prompt": false }` 时只读取状态，不主动请求授权。

### MCP：由独立 Cua Driver 持有权限

先按 Cua Driver 官方指南安装 `CuaDriver.app` / `cua-driver`，完成 macOS Accessibility 与 Screen Recording 授权，确认 `command -v cua-driver` 有结果。然后安装：

```sh
dsh plugin --profile web add \
  @deepseek-ai/dsh-computer-use@0.1.6-alpha.1 \
  @deepseek-ai/dsh-experimental-computer-use-cua-driver-mcp@0.1.6-alpha.1
```

配置：

```yaml
- insert:
    - id: computer-use
      name: '@deepseek-ai/dsh-computer-use'
    - id: computer-use-cua-mcp
      name: '@deepseek-ai/dsh-experimental-computer-use-cua-driver-mcp'
      config:
        command: /absolute/path/to/cua-driver
        args: [mcp]
```

macOS 若明确要让 MCP 子进程直接继承启动宿主的权限归属，可使用 `args: [mcp, --direct]`；官方更稳妥的日常模式是让 `CuaDriver.app` 持有权限并由 CLI 代理。工具名以 `mcp__cua-driver-mcp__` 开头。

## 运行边界

- Browser provider 每个活动 Session 启动独立浏览器；attach 模式除外。
- Computer Use 操作的是共享桌面，不隔离不同 Session。一次只运行一个桌面操作工作流。
- 截图进入模型需要附件存储和支持图片输入的模型路由；Web profile 已有本地附件存储，但仍需核对所选模型的图像能力。
- Browser provider 初始化失败可能让新建/恢复 Session 失败。修复后新建 Session，或卸载再恢复原 Session。
- Computer provider 是 optional 插件；启动日志出现 `did not activate` 时，Web 仍可能可用，但对应工具不会出现。
- 浏览器和桌面动作已经送达后，取消不会撤销动作。每次关键操作后应重新观察状态。

## 官方来源

- [Browser Use 概览](https://github.com/deepseek-ai/deepseek-harness/blob/0a15e36e7f82b6ed45af6fa9759f29b40dcd965d/docs/subsystems/browser-use.zh.md)
- [Playwright MCP provider](https://github.com/deepseek-ai/deepseek-harness/blob/0a15e36e7f82b6ed45af6fa9759f29b40dcd965d/packages/experimental/browser-use-playwright-mcp/README.zh.md)
- [Chrome DevTools MCP provider](https://github.com/deepseek-ai/deepseek-harness/blob/0a15e36e7f82b6ed45af6fa9759f29b40dcd965d/packages/experimental/browser-use-chrome-devtools-mcp/README.zh.md)
- [Stagehand provider](https://github.com/deepseek-ai/deepseek-harness/blob/0a15e36e7f82b6ed45af6fa9759f29b40dcd965d/packages/experimental/browser-use-stagehand-native/README.zh.md)
- [Computer Use 概览](https://github.com/deepseek-ai/deepseek-harness/blob/0a15e36e7f82b6ed45af6fa9759f29b40dcd965d/docs/subsystems/computer-use.zh.md)
- [Cua Driver Native provider](https://github.com/deepseek-ai/deepseek-harness/blob/0a15e36e7f82b6ed45af6fa9759f29b40dcd965d/packages/experimental/computer-use-cua-driver-native/README.zh.md)
- [Cua Driver MCP provider](https://github.com/deepseek-ai/deepseek-harness/blob/0a15e36e7f82b6ed45af6fa9759f29b40dcd965d/packages/experimental/computer-use-cua-driver-mcp/README.zh.md)
- [DSH profile 与插件管理](https://github.com/deepseek-ai/deepseek-harness/blob/0a15e36e7f82b6ed45af6fa9759f29b40dcd965d/apps/cli/reference/README.zh.md)
- [Cua Driver v0.28.0 macOS 权限归属](https://github.com/trycua/cua/blob/cua-driver-rs-v0.28.0/libs/cua-driver/README.md#macos-process-identity-and-permissions)
