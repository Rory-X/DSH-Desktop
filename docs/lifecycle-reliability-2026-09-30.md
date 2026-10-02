# 桌面退出与重启提示可靠性修复

追加：真实 main 与实际 DSH CLI 的联合演练已通过 12 项检查，详见 [主进程联合回滚](/Users/jiahaoqian/proj/DSH-Desktop/docs/full-main-restart-2026-09-30.md)。下文原生 IPC 计数器案例保留为独立边界证据；签名应用仍未替换。

本次改动保留工作区已有修改，不提交或推送。源码已修复，已签名的 `/Applications/DSH-Desktop.app` 尚未替换。现有 DSH 代理 `6b3ad17185db88e0` / PID 39147 保持运行。

`dsh-host.ts` 将 signalCode 纳入已退出判断；`main.ts` 在注册监听前和就绪返回前检查进程状态，并移除本次 exit 监听。真实子进程的九项退出/就绪边界通过；先前源文件中其他修改逐字节保留。

`dsh-lifecycle.ts` 将提示确认和选择绑定到收到提示的 webContents 主框架。其他窗口即使持有同一合成 ID，也不能确认或选择该提示。提示完成、窗口销毁、主框架更换文档或渲染进程结束时，清理重试/响应计时器和监听，并让后续询问继续排队。网页 API 形状保持兼容。

真实 Electron 43.4.0 的隐藏窗口、原生 IPC、桥接及 sandboxed preload 共 **18 项通过**，覆盖稍后、错误参数、其他窗口、过期/已消费提示、并发询问、未确认、显式调用、窗口销毁、文档更换、强制终止及实际 SIGABRT 崩溃。渲染事件分别观测到 `killed` / `crashed`；崩溃上传和系统崩溃处理关闭。所有测试窗口保持隐藏，前置窗口动作在测试边界被抑制。八个原有桌面测试文件 **45 项通过**，TypeScript 6.0.3 编译通过。

重启控制在该 IPC 测试中是私有计数器，因此这项证据不替代完整 main 编排与实际 DSH 子进程的联合故障回滚。macOS 外层 sandbox-exec 会阻断 Chromium 自身沙箱初始化，原失败保留；成功用例保持 Electron sandbox:true，并设置私有用户目录、Node 文件/连接守卫及 renderer 请求限制。原生 OS 背景 I/O 没有穷尽追踪，不宣称完整内核隔离。

源缺陷与测试装置失败分别保留：已安装版接受其他窗口响应；早期源候选在确认后窗口销毁仍等待响应超时；首次 Electron 双层沙箱失败、不可克隆的 renderer 返回值、测试摘要格式解析错误以及 killed/crashed 断言差异均有原始记录。没有将这些案例计入真实模型恢复率。

主要证据在 DSH Tencent 工作区：

- [源代码及前置修改保留审计](/Users/jiahaoqian/proj/dsh-tencent/docs/cursor-native-desktop-source-audit-2026-09-30.json)
- [最终原生 IPC 验收](/Users/jiahaoqian/proj/dsh-tencent/docs/cursor-native-desktop-ipc-terminal-verified-2026-09-30.json)
- [退出边界验收](/Users/jiahaoqian/proj/dsh-tencent/docs/cursor-desktop-lifecycle-source-final-2026-09-30.json)
- [完整桌面单元回归](/Users/jiahaoqian/proj/dsh-tencent/docs/cursor-desktop-source-regression-final-2026-09-30.json)

复现时先在 `/Users/jiahaoqian/proj/dsh-tencent` 运行 `scripts/build-desktop-acceptance.mjs`，取输出中的私有 source 目录，再分别运行 `scripts/verify-desktop-native-ipc.mjs`、`scripts/verify-desktop-lifecycle-contract.mjs --mode source` 及 `scripts/verify-desktop-source-regression.mjs`。原生测试会终止自己创建的 renderer，不使用生产 PID。源副本和成功/失败证据归档到当前代理 release 的 `goal-native-desktop-20260930/desktop-workspace/`，以 `source-backup.json` 为准。
