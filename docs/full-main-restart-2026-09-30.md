# 桌面主进程与 DSH 子进程联合回滚验收

追加签名打包模式已通过 13 项检查，真实 `isPackaged` 分支已执行；候选与备份已保存但未替换生产。详见 [签名候选验收](/Users/jiahaoqian/proj/DSH-Desktop/docs/signed-candidate-2026-09-30.md)。下文是此前开发模式证据。

本次执行编译后的真实 `main.js`，通过原生 renderer/preload/bridge IPC 调用其重启实现，启动真实 DSH CLI 子进程。没有替换重启实现或注册计数器控制。私有 profile 保留生产解析出的 23 个 bundle、215 个配置身份，清除凭据并映射用户路径；另加一个只读状态观察器。

**12 项通过**：初次启动、正常重启、同窗刷新、并发请求合并、损坏私有 CLI 入口时拒绝重启、恢复入口后同窗重试、回滚旧 build、重新应用候选、两次内核哈希核对、子进程归属、隐藏窗口和加载状态一致性。七次原生重启请求产生七个实际 DSH 进程，其中一次入口语法错误退出；其他六个正常阶段各有 216 条状态，180 active / 36 disabled。每个阶段终端契约为 2，body guard 注册一次。七个子进程最后全部退出。

原生 IPC 请求从真实 preload 发出。重启会更换页面，因此不等待旧 renderer 中的 Promise；仅观察原有主进程 IPC handler 的完成状态，原 handler 返回值未修改。私有 Node 可执行入口是启动内置 Node 的 sandbox-exec 包装脚本。子进程内核探针确认外部读/写、fork、向其他进程发信号和出站连接被拒绝。

初次演练的九项行为检查通过，但退出期间状态观察器覆盖了 candidate/recovered 的快照，完整状态一致性无法证明。保留初次报告和失败审计；最终演练在每次停止前保存不可变 ready 快照，并要求全部启用项为 active。六次完整状态/顺序一致，候选内核、私有 CLI 入口及编译源码哈希复核通过。

生产代理 PID、buildId、启动时间及安装内核/应用哈希保持一致。窗口 show/focus、Dock、通知显示和错误弹窗在明确视觉边界抑制，没有将视觉展示记为验收通过。旧版 browser/computer 配置仍受 SDK 兼容性禁用保护，没有放宽例外。

该演练使用真实 Electron 的开发模式和私有 SDK 安装目录。签名应用的打包启动、安装升级与生产故障注入尚未验证；生产 `/Applications/DSH-Desktop.app` 未替换。

- [最终联合演练](/Users/jiahaoqian/proj/dsh-tencent/docs/cursor-full-native-desktop-verified-2026-09-30.json)
- [状态与源码复核](/Users/jiahaoqian/proj/dsh-tencent/docs/cursor-full-native-desktop-audit-2026-09-30.json)
- [保留的初次审计缺口](/Users/jiahaoqian/proj/dsh-tencent/docs/cursor-full-native-desktop-first-audit-2026-09-30.json)

复现使用 DSH Tencent 工作区的 `prepare-full-desktop-fixture.mjs` 创建新的私有 root，再交给 `verify-full-desktop-restart.mjs --root ... --output ...`。验证器拒绝复用既有执行结果。两个工作区源码、原生主进程执行脚本、内核策略、启动/退出日志和全部 ready 快照归档到当前 release 的 `goal-full-main-20260930/`，以 `source-backup.json` 为准。
