# 签名桌面候选与打包模式验收

当前更新：候选已在空闲时安装并启动，实际包校验通过。见 [已安装生命周期修复](/Users/jiahaoqian/proj/DSH-Desktop/docs/installed-lifecycle-fixes-2026-09-30.md)。下文保留候选阶段历史。

候选 buildVersion 为 `2026093001`，营销版本保持 `0.2.2`。从已安装应用复制未改动的框架/运行时与资产，将 25 个编译 JS 文件替换为验收后的源码产物，重新打包 ASAR、更新 ElectronAsarIntegrity 头哈希，并以现有 hardened runtime 权限进行 ad-hoc 签名。`codesign --verify --deep --strict` 及包内源码哈希通过；没有 Apple Developer ID / notarization 声明。

独立的签名演练副本实际进入 `app.isPackaged === true` 分支。原生 IPC 到真实 main、实际 DSH 子进程的 **13 项检查通过**；六个正常阶段保持 216 条相同加载状态，180 active / 36 disabled，七个 DSH 子进程全部退出。用户数据目录在调用实际 main 前设置到私有位置，未触发生产实例的单实例锁或前置窗口。

演练副本修改启动入口以安装观察器、抑制视觉动作，将其 Node 指向私有内核沙箱包装脚本，并移除自动安装器。**交付候选未做这些修改**：它保留真实 Node 二进制、安装器和原 main 入口。两者分别签名和核对哈希，因此本演练证明打包分支和联合链路，未证明未加观察器的生产升级已完成。

候选和原应用备份安全保存到当前 DSH release 的 `desktop-candidate-20260930/`，均经过深度严格签名校验；父目录 0700、清单 0600，清单及 ASAR 已 fsync。当前 `/Applications/DSH-Desktop.app` 未替换，生产 PID/buildId/启动时间不变。

- [候选与备份交付清单](/Users/jiahaoqian/proj/dsh-tencent/docs/cursor-desktop-candidate-delivery-2026-09-30.json)
- [签名与来源审计](/Users/jiahaoqian/proj/dsh-tencent/docs/cursor-signed-desktop-candidate-audit-2026-09-30.json)
- [签名打包版联合验收](/Users/jiahaoqian/proj/dsh-tencent/docs/cursor-packaged-desktop-first-2026-09-30.json)

本轮两个工作区源码、打包演练脚本、签名/完整性信息及所有原始快照归档到 `goal-signed-desktop-20260930/`，校验以 `source-backup.json` 为准。后续仍需未加演练改动的候选实际交付及安装恢复验收；没有自动提交或推送。
