# Restart DSH Service 偶发闪退排查

## 结论

确认并复现了一条会导致 Electron 主进程 SIGSEGV 的浮层生命周期竞态。
这不是 DSH 子进程退出后调用 `app.quit()`，也不是置顶数据丢失。

重启服务会关闭浮层；并发的浮层打开请求也会取消旧导航。
旧代码把部分导航失败视为正常结束，随后仅凭 `BrowserWindow.isDestroyed()`
决定是否执行 `showInactive()`。Electron 关闭窗口时存在一个中间状态：

- `BrowserWindow.isDestroyed() === false`
- `win.webContents.isDestroyed() === true`

在此时调用 `showInactive()`，会进入原生 `BrowserWindow::ShowInactive` /
`WebContentsImpl::WasShown` 链路并访问无效渲染状态。JavaScript `try/catch`
无法捕获原生 SIGSEGV。

## 证据

- 实际崩溃：`~/Library/Logs/DiagnosticReports/DSH-Desktop-2026-09-15-175008.ips`。
  捕获时间为 2026-09-15 17:50:06 +0800，主线程 `CrBrowserMain`，
  `EXC_BAD_ACCESS / SIGSEGV`，无效地址 `0x1250`，Electron Framework 43.4.0。
- 隔离复现：`scripts/overlay-restart-probe.cjs`，使用临时 Chromium 数据目录和
  本地假 HTTP 服务，不读取 DSH 会话或生产 profile。
- 修复前第一轮退出码 139。调用前日志同时记录到窗口未销毁、WebContents 已销毁。
- 复现崩溃：`Electron-2026-09-15-175528.ips`。与实际崩溃的前九个
  Electron Framework image offset 完全相同：
  `1bfc5ac, 1c571dc, 1f9d1b8, 1f9cf9c, 2865b9c, 1fee208, 285ffcc, 285ff74, 285fe54`。
- 系统报告中的 `SetRootCerts`、`IsNumber` 等名称是裁剪后二进制的邻近导出符号，
  不能据此判断 TLS 根证书故障。LLDB 对相同二进制的反汇编显示
  `WebContentsImpl::WasShown` 和可见性变更相关字符串；相应函数结构与
  Electron 43.4.0 的 BrowserWindow ShowInactive 实现吻合。

## 修复

1. 同一 contributor 的打开操作串行执行，避免重复导航互相取消。
2. 关闭浮层时立即移除其有效状态，并使运行中及排队中的打开操作失效。
3. 每个异步边界后同时检查操作有效性、所属窗口、BrowserWindow 和 WebContents。
4. 不再把 `ERR_ABORTED` / `ERR_FAILED` 当作可以显示窗口的成功结果。
5. 重启后重新兑换浮层鉴权，旧请求完成时不能覆盖新一代鉴权状态。
6. 迟到的旧窗口清理不得取消重启后新窗口的操作。
7. 通知横幅的同类 `showInactive()` 调用也检查 WebContents 是否已销毁。

## 验证

- `npm run build`
- `node --test test/*.test.cjs`
- `node_modules/electron/dist/Electron.app/Contents/MacOS/Electron scripts/overlay-restart-probe.cjs`

修复后原生探针连续完成 40 轮，每轮两个打开请求；交替验证加载中关闭和并发复用。
函数与接口测试另覆盖已销毁内容、延迟鉴权、排队取消和失败导航。
没有对正在使用的 DSH 服务执行重复重启，也没有浏览器端到端操作。

修复位于 Electron 主进程，必须完全退出并启动修复版应用；
刷新页面或仅使用 Restart DSH Service 不会更新已加载的桌面壳代码。
