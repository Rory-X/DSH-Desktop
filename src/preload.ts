/**
 * DSH-Desktop preload：以 contextBridge 向 DSH 网页暴露标准桌面 API。
 *
 * 契约见 `./api`（updates / seats / notify / overlays）。本文件只做 IPC 转发，
 * 不引入 Menu / Tray / Notification / BrowserWindow。普通浏览器没有 window.dshDesktop。
 */

import { contextBridge, ipcRenderer, webFrame } from 'electron'
import type {
  DesktopBootFailure,
  DesktopContribution,
  DesktopNotifyAction,
  DesktopNotifySpec,
  DesktopOverlayClosed,
  DesktopOverlayMoveSpec,
  DesktopOverlayOpenSpec,
  DesktopOverlayUpdateSpec,
  DesktopPluginInfo,
  DesktopRestartChoice,
  DesktopRestartPrompt,
  DesktopSeatAction,
  DesktopSeatName,
  DshChannel,
  DshDesktop,
  DesktopUpdateKind,
  DesktopUpdateState,
} from './api'
import type { Ipc as IpcShape } from './ipc'

// 窗口 webPreferences 开了 sandbox:true，sandboxed preload 的 require 只认
// electron 等极少数模块，require('./ipc') 会直接抛错、整个 preload 夭折，
// window.dshDesktop 永远注入不进来。因此频道常量必须内联在本文件里；
// import type 编译后完全擦除（不产生 require），satisfies 把下面每个
// 字面量值强绑定到 ./ipc.ts 的 as const 类型上——任一边改了一个字符，
// tsc 都会在这里报错，无需人工同步。
const Ipc = {
  updates: {
    appVersion: 'desktop:updates:app-version',
    downloadApp: 'desktop:updates:download-app',
    updateDsh: 'desktop:updates:update-dsh',
    restartWeb: 'desktop:updates:restart-web',
    prompt: 'desktop:updates:prompt',
    promptAck: 'desktop:updates:prompt-ack',
    promptResponse: 'desktop:updates:prompt-response',
    getState: 'desktop:updates:get-state',
    state: 'desktop:updates:state',
    checkNow: 'desktop:updates:check-now',
    setDshChannel: 'desktop:updates:set-dsh-channel',
    skipVersion: 'desktop:updates:skip-version',
    setGate: 'desktop:updates:set-gate',
    relaunch: 'desktop:updates:relaunch',
  },
  seats: {
    list: 'desktop:seats:list',
    contribute: 'desktop:seats:contribute',
    revoke: 'desktop:seats:revoke',
    action: 'desktop:seats:action',
  },
  notify: {
    show: 'desktop:notify:show',
    close: 'desktop:notify:close',
    action: 'desktop:notify:action',
  },
  overlays: {
    open: 'desktop:overlays:open',
    update: 'desktop:overlays:update',
    move: 'desktop:overlays:move',
    setIgnoreMouseEvents: 'desktop:overlays:set-ignore-mouse-events',
    focus: 'desktop:overlays:focus',
    close: 'desktop:overlays:close',
    list: 'desktop:overlays:list',
    closed: 'desktop:overlays:closed',
  },
  plugins: {
    list: 'desktop:plugins:list',
    setEnabled: 'desktop:plugins:set-enabled',
    clearFailure: 'desktop:plugins:clear-failure',
    relaunch: 'desktop:plugins:relaunch',
  },
} satisfies typeof IpcShape

const api: DshDesktop = {
  updates: {
    // ---- 执行端点：正式契约 ----
    appVersion: (): Promise<string> => ipcRenderer.invoke(Ipc.updates.appVersion),
    downloadApp: (url?: string): Promise<void> => ipcRenderer.invoke(Ipc.updates.downloadApp, url),
    updateDsh: (version?: string): Promise<void> =>
      ipcRenderer.invoke(Ipc.updates.updateDsh, version),
    restartWeb: (): Promise<void> => ipcRenderer.invoke(Ipc.updates.restartWeb),
    relaunch: (): void => ipcRenderer.send(Ipc.updates.relaunch),

    // ---- 热重启询问：主进程推、页面渲染 Modal 后回执 ----
    onPrompt: (listener: (prompt: DesktopRestartPrompt) => void): (() => void) => {
      const wrapped = (_event: unknown, prompt: DesktopRestartPrompt) => listener(prompt)
      ipcRenderer.on(Ipc.updates.prompt, wrapped)
      return () => ipcRenderer.removeListener(Ipc.updates.prompt, wrapped)
    },
    ackPrompt: (id: string): void => {
      ipcRenderer.send(Ipc.updates.promptAck, id)
    },
    respondPrompt: (id: string, choice: DesktopRestartChoice): void => {
      ipcRenderer.send(Ipc.updates.promptResponse, id, choice)
    },

    // ---- 兼容层：仅 0.1.x 旧插件用；新插件的检测在插件 host 半侧 ----
    getState: (): Promise<DesktopUpdateState> => ipcRenderer.invoke(Ipc.updates.getState),
    onState: (listener: (state: DesktopUpdateState) => void): (() => void) => {
      const wrapped = (_event: unknown, state: DesktopUpdateState) => listener(state)
      ipcRenderer.on(Ipc.updates.state, wrapped)
      return () => ipcRenderer.removeListener(Ipc.updates.state, wrapped)
    },
    checkNow: (): Promise<DesktopUpdateState> => ipcRenderer.invoke(Ipc.updates.checkNow),
    setDshChannel: (channel: DshChannel, version?: string): Promise<DesktopUpdateState> =>
      ipcRenderer.invoke(Ipc.updates.setDshChannel, channel, version),
    skipVersion: (kind: DesktopUpdateKind): Promise<void> =>
      ipcRenderer.invoke(Ipc.updates.skipVersion, kind),
    setGate: (kind: DesktopUpdateKind, enabled: boolean): Promise<DesktopUpdateState> =>
      ipcRenderer.invoke(Ipc.updates.setGate, kind, enabled),
  },
  seats: {
    list: () => ipcRenderer.invoke(Ipc.seats.list),
    contribute: (contribution: DesktopContribution) =>
      ipcRenderer.invoke(Ipc.seats.contribute, contribution),
    revoke: (seat: DesktopSeatName, contributor: string) =>
      ipcRenderer.invoke(Ipc.seats.revoke, seat, contributor),
    onAction: (listener: (action: DesktopSeatAction) => void): (() => void) => {
      const wrapped = (_event: unknown, action: DesktopSeatAction) => listener(action)
      ipcRenderer.on(Ipc.seats.action, wrapped)
      return () => ipcRenderer.removeListener(Ipc.seats.action, wrapped)
    },
  },
  notify: {
    show: (spec: DesktopNotifySpec) => ipcRenderer.invoke(Ipc.notify.show, spec),
    close: (contributor: string, id?: string) =>
      ipcRenderer.invoke(Ipc.notify.close, contributor, id),
    onAction: (listener: (action: DesktopNotifyAction) => void): (() => void) => {
      const wrapped = (_event: unknown, action: DesktopNotifyAction) => listener(action)
      ipcRenderer.on(Ipc.notify.action, wrapped)
      return () => ipcRenderer.removeListener(Ipc.notify.action, wrapped)
    },
  },
  overlays: {
    open: (spec: DesktopOverlayOpenSpec) => ipcRenderer.invoke(Ipc.overlays.open, spec),
    update: (id: string, spec: DesktopOverlayUpdateSpec) =>
      ipcRenderer.invoke(Ipc.overlays.update, id, spec),
    move: (id: string, spec: DesktopOverlayMoveSpec) =>
      ipcRenderer.invoke(Ipc.overlays.move, id, spec),
    setIgnoreMouseEvents: (id: string, ignore: boolean, opts?: { forward?: boolean }) =>
      ipcRenderer.invoke(Ipc.overlays.setIgnoreMouseEvents, id, ignore, opts),
    focus: (id: string) => ipcRenderer.invoke(Ipc.overlays.focus, id),
    close: (id: string) => ipcRenderer.invoke(Ipc.overlays.close, id),
    list: () => ipcRenderer.invoke(Ipc.overlays.list),
    onClosed: (listener: (event: DesktopOverlayClosed) => void): (() => void) => {
      const wrapped = (_event: unknown, event: DesktopOverlayClosed) => listener(event)
      ipcRenderer.on(Ipc.overlays.closed, wrapped)
      return () => ipcRenderer.removeListener(Ipc.overlays.closed, wrapped)
    },
  },
  plugins: {
    list: (): Promise<{ plugins: DesktopPluginInfo[]; failure: DesktopBootFailure | null }> =>
      ipcRenderer.invoke(Ipc.plugins.list),
    setEnabled: (name: string, enabled: boolean): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(Ipc.plugins.setEnabled, name, enabled),
    clearFailure: (): Promise<void> => ipcRenderer.invoke(Ipc.plugins.clearFailure),
    relaunch: (): void => ipcRenderer.send(Ipc.plugins.relaunch),
  },
}

contextBridge.exposeInMainWorld('dshDesktop', api)

// ---------------------------------------------------------------------------
// 桌面标记：告诉 DSH 网页「我跑在 macOS 原生壳里」
// ---------------------------------------------------------------------------
//
// 上游把「运行在 macOS 桌面壳」这件事编码成一个 DOM 标记，契约写在
// @deepseek-ai/dsh-client-ui-primitives 里：
//
//   Whether the client runs in the macOS desktop shell: the Electron preload
//   marks `<html>` with `data-platform="darwin"`; plain web never sets it.
//   Read at render time — the mark may arrive as late as DOMContentLoaded.
//
// 「set only by the desktop preload」这句话在 ui-sidebar / ui-layout 两份
// README 里都重复了一遍，是上游公开的窗口集成契约，不是内部细节。
//
// ## 为什么必须由 preload 打，而不是注入 CSS
//
// 这个标记门控的不只是样式，还有 JSX 层的条件渲染与列宽计算，二者都
// 在页面脚本里跑，注入 CSS 改不到：
//
//   ui-layout   darwin && <div className={leadingBand} data-shell-leading-band />
//               —— 全宽 52px 窗口拖拽带，无标记时整个节点不存在
//   ui-layout   collapsedWidth = darwin ? 0 : 56
//               —— 收起侧栏时不保留轨道
//   ui-sidebar  darwinDesktop && <div className={topStrip}>{toggle}</div>
//               —— 侧栏顶部条与收起按钮
//
// 实测（0.1.7-alpha.2，遍历 body 取 app-region: drag 的元素）：
// 无标记时全页**零个**拖拽区 —— 这正是本壳不得不手写一整套 app-region
// 规则的原因。接上标记后这些职责交还上游。
//
// ## 为什么要在 document-start 就打
//
// 上游文档明说「Read at render time — the mark may arrive as late as
// DOMContentLoaded」，但 preload 运行时文档可能还没建好（documentElement
// 为 null），SPA 首帧又可能早于 DOMContentLoaded。因此多重兜底：
// 立即试一次 + 监听 readystatechange + 监听 DOMContentLoaded。
// 标记必须在 React 首次渲染前就位，否则首帧会按非 darwin 布局渲染。
//
// 用 webFrame.executeJavaScript 而非直接写 document：本文件的 tsconfig
// `lib` 只有 ES2022（不含 dom），且 preload 跑在 isolated world，
// 用字符串脚本与上面 Notification 桥保持同一姿势。
if (process.platform === 'darwin') {
  const MARK_DARWIN = `(() => {
  const apply = () => {
    const root = document.documentElement
    if (root === null) return
    if (root.dataset.platform === 'darwin') return
    root.dataset.platform = 'darwin'
  }
  apply()
  document.addEventListener('readystatechange', apply)
  document.addEventListener('DOMContentLoaded', apply, { once: true })
})()`
  void webFrame.executeJavaScript(MARK_DARWIN).catch(() => {
    // 文档尚未建立时执行会失败；readystatechange / 下一次导航仍会重试。
  })
}

// 必须在页面主世界替换 Notification：主进程 executeJavaScript 进不到
// contextIsolation 下的页面世界，插件会继续走被系统静默丢掉的浏览器 API。
const WEB_NOTIFICATION_BRIDGE = `(() => {
  if (window.__dshNotifyBridge) return
  const desktop = window.dshDesktop
  if (desktop === undefined || desktop.notify === undefined) return
  window.__dshNotifyBridge = true
  const CONTRIBUTOR = 'web-notification'
  const instances = new Map()
  function toId(tag) {
    const raw = String(tag || ('n' + Date.now())).replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 64)
    return /^[A-Za-z0-9]/.test(raw) ? raw : ('n' + raw).slice(0, 64)
  }
  class DesktopNotification {
    static get permission() { return 'granted' }
    static requestPermission() {
      void desktop.notify.show({
        contributor: CONTRIBUTOR,
        id: toId('permission-' + Date.now()),
        title: 'DSH-Desktop',
        body: '通知已接通',
      })
      return Promise.resolve('granted')
    }
    static get maxActions() { return 0 }
    constructor(title, options) {
      const opts = options === undefined || options === null ? {} : options
      this.title = String(title ?? '')
      this.body = String(opts.body ?? '')
      this.tag = opts.tag
      this.onclick = null
      this.onshow = null
      this.onerror = null
      this.onclose = null
      this._id = toId(opts.tag)
      instances.set(this._id, this)
      const shownTitle = this.title.slice(0, 80) || 'DSH'
      const shownBody = (this.body === '' ? ' ' : this.body).slice(0, 240)
      void desktop.notify.show({
        contributor: CONTRIBUTOR,
        id: this._id,
        title: shownTitle,
        body: shownBody,
        silent: opts.silent === true,
      }).then((result) => {
        if (result !== undefined && result.shown === true) {
          if (typeof this.onshow === 'function') this.onshow(new Event('show'))
        } else if (typeof this.onerror === 'function') {
          this.onerror(new Event('error'))
        }
      }).catch(() => {
        if (typeof this.onerror === 'function') this.onerror(new Event('error'))
      })
    }
    close() {
      void desktop.notify.close(CONTRIBUTOR, this._id)
      if (typeof this.onclose === 'function') this.onclose(new Event('close'))
    }
    addEventListener(type, fn) {
      if (type === 'click') this.onclick = fn
      else if (type === 'show') this.onshow = fn
      else if (type === 'error') this.onerror = fn
      else if (type === 'close') this.onclose = fn
    }
    removeEventListener(type, fn) {
      if (type === 'click' && this.onclick === fn) this.onclick = null
      else if (type === 'show' && this.onshow === fn) this.onshow = null
      else if (type === 'error' && this.onerror === fn) this.onerror = null
      else if (type === 'close' && this.onclose === fn) this.onclose = null
    }
  }
  desktop.notify.onAction((action) => {
    if (action.contributor !== CONTRIBUTOR) return
    const inst = instances.get(action.id)
    if (inst !== undefined && typeof inst.onclick === 'function') inst.onclick(new Event('click'))
  })
  window.Notification = DesktopNotification
})()`
void webFrame.executeJavaScript(WEB_NOTIFICATION_BRIDGE).catch(() => {})
