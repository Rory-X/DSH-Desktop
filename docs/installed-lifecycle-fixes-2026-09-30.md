# 生命周期修复已安装

Desktop buildVersion `2026093001` 已在确认空闲后安装，仍为营销版本 `0.2.2`。实际桌面 PID `79645`，代理 PID `79685`，启动时间 `2026-09-30T04:25:37.875Z`；代理 build 保持 `6b3ad17185db88e0`。实际启动使用正常 main、Node 二进制及安装器，不含演练启动入口。

逐项核对 ASAR：包内 29 个文件的身份列表保持一致，仅 `dist/dsh-host.js`、`dist/dsh-lifecycle.js`、`dist/main.js` 三个文件有变化，对应此前复现的退出判断、重启提示窗口绑定及提示生命周期修复。已存在的工作区改动没有额外进入本次应用交付。

安装前活动、暂停、待处理工具、压缩计数均为零。再次确认状态和请求数后才结束原桌面，等待父/子进程退出；没有使用 SIGKILL。安装采用同卷目录改名，保留候选、原应用副本以及原实际安装目录。健康验证同时检查精确代理 build、真实 Desktop 父子 PID、签名、完整包身份和保护文件哈希。失败时自动恢复原包；出现新的活动工作则拒绝停止或覆盖该应用。

保护的 10 个文件包含代理配置、三份 web profile、代理前后端产物和四份内核；安装后全部哈希一致。实际安装包深度严格签名通过，原 Node 二进制哈希不变。重新从实际安装 ASAR 提取源码，**9 项退出边界及 18 项原生 IPC 检查通过**，测试窗口保持隐藏。安装/回滚 helper 的 **6 项文件系统行为测试**和类型检查通过；不把这些追加检查计入先前 72 文件/649 项完整代理回归。

初次预检因私有备份目录的 0700 权限与原应用 0755 不同而拒绝，日志保留。确认仅目录权限差异、文件字节和可执行权限一致后，安装准备目录的权限从原应用逐项恢复；最终预检通过。文件和目录均已 fsync。父 release 目录保留 0700，清单和源码包保留 0600。

- [实际安装验收](/Users/jiahaoqian/proj/dsh-tencent/docs/cursor-desktop-installed-acceptance-2026-09-30.json)
- [安装回执](/Users/jiahaoqian/.dsh/storages/dsh-proxy/releases/20260929-RGgCq2/desktop-candidate-20260930/installation.json)
- [实际安装退出校验](/Users/jiahaoqian/proj/dsh-tencent/docs/cursor-desktop-installed-exit-verified-2026-09-30.json)
- [实际安装原生 IPC 校验](/Users/jiahaoqian/proj/dsh-tencent/docs/cursor-desktop-installed-native-ipc-verified-2026-09-30.json)

两个工作区源码、实际安装包源码副本、签名候选/备份清单、成功/失败日志归档到当前 release 的 `goal-installed-desktop-20260930/`，校验以 `source-backup.json` 为准。没有提交或推送。上游停滞根因、正式扩展契约和可比生产效果数据仍由原 goal 继续追踪，不据此宣称整体完美。
