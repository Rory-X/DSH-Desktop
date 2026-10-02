// Real Electron IPC acceptance. Windows remain hidden; only the existing focus
// side effect is suppressed. Lifecycle, bridge and sandboxed preload are loaded
// from the supplied source snapshot without mocking Electron.
const fs = require('node:fs')
const path = require('node:path')
const { app, BrowserWindow, ipcMain, session, crashReporter } = require('electron')
const root = process.env.DSH_IPC_PROBE_ROOT
if (!root) throw new Error('Private IPC probe root is required')
let deniedFiles = 0,
  deniedNodeConnections = 0
const privatePath = (value) => path.resolve(String(value)).startsWith(root + path.sep)
const productionPath = (value) => path.resolve(String(value)).startsWith('/Users/jiahaoqian/.dsh/')
for (const method of [
  'readFileSync',
  'readFile',
  'writeFileSync',
  'appendFileSync',
  'mkdirSync',
  'unlinkSync',
  'rmSync',
  'renameSync',
]) {
  const original = fs[method]
  fs[method] = function (file, ...args) {
    const read = method.startsWith('read')
    if (
      (read && productionPath(file)) ||
      (!read && !privatePath(file)) ||
      (method === 'renameSync' && !privatePath(args[0]))
    ) {
      deniedFiles++
      const error = new Error('IPC fixture denied production/outside file access')
      error.code = 'EPERM'
      throw error
    }
    return original.call(this, file, ...args)
  }
}
const net = require('node:net'),
  connect = net.Socket.prototype.connect
net.Socket.prototype.connect = function (...args) {
  const option = Array.isArray(args[0]) ? args[0][0] : args[0]
  const pipe =
    typeof option === 'string' ||
    (option && typeof option === 'object' && typeof option.path === 'string')
  if (!pipe) {
    deniedNodeConnections++
    throw new Error('IPC fixture denied Node TCP connection')
  }
  return connect.apply(this, args)
}
for (const name of ['userData', 'sessionData', 'logs', 'crashDumps']) {
  const directory = path.join(root, name)
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  app.setPath(name, directory)
}
app.setName('DSH hidden IPC acceptance')
app.setActivationPolicy('prohibited')
app.commandLine.appendSwitch('disable-background-networking')
const report = {
  generatedAt: new Date().toISOString(),
  kind: 'native-electron-hidden-window-ipc',
  electronVersion: process.versions.electron,
  checks: {},
  ipcEvents: [],
  focusSuppressed: 0,
  windowsWereVisible: false,
  windowEvents: [],
  externalRequests: 0,
  blockedRequests: 0,
  productionRestarted: false,
  limitations: [
    'Window focus is suppressed at the focus helper boundary; native windows, IPC, bridge and preload are real.',
    'Restart control is a private counter; this does not replace actual full Desktop/DSH CLI fault rollback acceptance.',
    'Native Electron uses its own renderer sandbox. Additional guards cover Node file/socket APIs and renderer requests; native OS background I/O is not exhaustively traced.',
  ],
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const windows = []
let restarts = 0,
  serviceReady = true
async function bounded(predicate, timeout = 3000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await predicate()) return
    await pause(20)
  }
  throw new Error('Native IPC fixture did not reach its bounded barrier')
}
async function createWindow(role, helpers) {
  const win = new BrowserWindow({
    show: false,
    focusable: false,
    skipTaskbar: true,
    width: 300,
    height: 160,
    webPreferences: {
      preload: path.join(root, 'dist/preload.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  windows.push(win)
  helpers.setWindowRole(win, role)
  const id = win.webContents.id
  win.webContents.on('destroyed', () => report.windowEvents.push({ kind: 'destroyed', id }))
  win.webContents.on('render-process-gone', (_event, details) =>
    report.windowEvents.push({
      kind: 'render-process-gone',
      id,
      reason: details.reason,
      exitCode: details.exitCode,
    }),
  )
  win.webContents.on('did-start-navigation', (details) =>
    report.windowEvents.push({
      kind: 'navigation',
      id,
      mainFrame: details.isMainFrame,
      sameDocument: details.isSameDocument,
    }),
  )
  win.on('show', () => {
    report.windowsWereVisible = true
    win.hide()
  })
  await win.loadURL('data:text/html,<html><body>Private IPC fixture</body></html>')
  await win.webContents.executeJavaScript(
    `window.__probe={prompts:[]};window.dshDesktop.updates.onPrompt(p=>window.__probe.prompts.push(p));true;`,
  )
  return win
}
async function send(win, method, ...args) {
  await win.webContents.executeJavaScript(
    `window.dshDesktop.updates.${method}(...${JSON.stringify(args)})`,
  )
}
async function response(win, id, choice) {
  const count = report.ipcEvents.filter((event) => event.channel === 'response').length
  await send(win, 'respondPrompt', id, choice)
  await bounded(
    () => report.ipcEvents.filter((event) => event.channel === 'response').length > count,
  )
}
async function prompts(win) {
  return win.webContents.executeJavaScript('window.__probe.prompts')
}
async function beginOffer(lifecycle, win, reason = 'plugin') {
  const before = (await prompts(win)).length
  const state = { settled: false, value: undefined }
  state.promise = lifecycle.offerRestartDshWeb(reason).then((value) => {
    state.settled = true
    state.value = value
    return value
  })
  await bounded(async () => (await prompts(win)).length > before)
  state.prompt = (await prompts(win)).at(-1)
  return state
}
app
  .whenReady()
  .then(async () => {
    app.dock?.hide()
    crashReporter.start({ uploadToServer: false, ignoreSystemCrashHandler: true })
    report.crashUploadDisabled = !crashReporter.getUploadToServer()
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      const local = /^(data:|file:|about:)/.test(details.url)
      if (!local) report.blockedRequests++
      callback({ cancel: !local })
    })
    const helper = require(path.join(root, 'dist/windows.js'))
    helper.focusMainWindow = () => {
      report.focusSuppressed++
    }
    const lifecycle = require(path.join(root, 'dist/dsh-lifecycle.js'))
    const { Ipc } = require(path.join(root, 'dist/ipc.js'))
    require(path.join(root, 'dist/desktop-bridge.js')).setupDesktopBridge()
    lifecycle.registerDshWebHost({
      isReady: () => serviceReady,
      restart: async () => {
        restarts++
      },
    })
    for (const [channel, kind] of [
      [Ipc.updates.promptAck, 'ack'],
      [Ipc.updates.promptResponse, 'response'],
    ]) {
      ipcMain.on(channel, (event, id, choice) =>
        report.ipcEvents.push({
          channel: kind,
          sender: event.sender.id,
          mainFrame: event.senderFrame === event.sender.mainFrame,
          stringId: typeof id === 'string',
          choice: typeof choice === 'string' ? choice : null,
        }),
      )
    }
    let main = await createWindow('main', helper)
    const other = await createWindow('overlay', helper)
    report.checks.sandboxedPreloadAvailable = await main.webContents.executeJavaScript(
      'typeof window.dshDesktop.updates.onPrompt === "function" && typeof require === "undefined"',
    )
    serviceReady = false
    report.checks.notReadyOfferDoesNotRestart =
      (await lifecycle.offerRestartDshWeb('plugin')) === false && restarts === 0
    serviceReady = true
    const listenerNames = ['destroyed', 'render-process-gone', 'did-start-navigation']
    const initialListeners = listenerNames.map((name) => main.webContents.listenerCount(name))
    let start = restarts,
      offer = await beginOffer(lifecycle, main)
    await send(main, 'ackPrompt', offer.prompt.id)
    await response(main, offer.prompt.id, 'later')
    await offer.promise
    report.checks.laterDoesNotRestart = offer.value === false && restarts === start
    report.checks.settledPromptRemovesLifecycleListeners = listenerNames.every(
      (name, i) => main.webContents.listenerCount(name) === initialListeners[i],
    )

    start = restarts
    offer = await beginOffer(lifecycle, main)
    await send(main, 'ackPrompt', offer.prompt.id)
    for (const [id, choice] of [
      [13, 'restart'],
      ['wrong-id', 'restart'],
      [offer.prompt.id, 'invalid'],
    ])
      await response(main, id, choice)
    report.checks.invalidIdAndChoiceIgnored = !offer.settled && restarts === start
    await response(main, offer.prompt.id, 'later')
    await offer.promise

    start = restarts
    offer = await beginOffer(lifecycle, main)
    await send(main, 'ackPrompt', offer.prompt.id)
    await response(other, offer.prompt.id, 'restart')
    // Wait for the real IPC handler's async restart continuation to finish.
    await pause(50)
    report.checks.otherWindowCannotSettlePrompt = !offer.settled && restarts === start
    if (!offer.settled) await response(main, offer.prompt.id, 'later')
    await offer.promise

    offer = await beginOffer(lifecycle, main)
    const beforeAck = (await prompts(main)).length
    await send(other, 'ackPrompt', offer.prompt.id)
    await pause(550)
    report.checks.otherWindowCannotAckPrompt = (await prompts(main)).length > beforeAck
    await response(main, offer.prompt.id, 'later')
    await offer.promise

    start = restarts
    offer = await beginOffer(lifecycle, main, 'dsh-runtime')
    await send(main, 'ackPrompt', offer.prompt.id)
    await response(main, offer.prompt.id, 'restart')
    await offer.promise
    report.checks.ownerRestartExactlyOnce = offer.value === true && restarts === start + 1
    await response(main, offer.prompt.id, 'restart')
    await pause(50)
    report.checks.consumedPromptIgnored = restarts === start + 1

    const consumedId = offer.prompt.id
    start = restarts
    offer = await beginOffer(lifecycle, main)
    await send(main, 'ackPrompt', offer.prompt.id)
    await response(main, consumedId, 'restart')
    report.checks.stalePromptCannotSettleCurrent = !offer.settled && restarts === start
    await response(main, offer.prompt.id, 'later')
    await offer.promise

    start = restarts
    offer = await beginOffer(lifecycle, main)
    await send(main, 'ackPrompt', offer.prompt.id)
    const beforeQueued = (await prompts(main)).length,
      queued = { settled: false }
    const queuedPromise = lifecycle.offerRestartDshWeb('dsh-runtime').then((value) => {
      queued.settled = true
      queued.value = value
    })
    await pause(50)
    const stayedQueued = !queued.settled && (await prompts(main)).length === beforeQueued
    await response(main, offer.prompt.id, 'later')
    await bounded(() => offer.settled)
    await bounded(async () => (await prompts(main)).length > beforeQueued)
    const queuedPrompt = (await prompts(main)).at(-1)
    await send(main, 'ackPrompt', queuedPrompt.id)
    await response(main, queuedPrompt.id, 'restart')
    await queuedPromise
    report.checks.concurrentOffersPreserveSeparateChoices =
      stayedQueued &&
      offer.value === false &&
      queued.value === true &&
      queuedPrompt.id !== offer.prompt.id &&
      restarts === start + 1

    start = restarts
    offer = await beginOffer(lifecycle, main)
    await bounded(() => offer.settled, 5000)
    report.checks.unacknowledgedPromptDoesNotRestart = offer.value === false && restarts === start
    start = restarts
    await send(main, 'restartWeb')
    report.checks.explicitRestartUsesActualInvokeHandler = restarts === start + 1
    start = restarts
    offer = await beginOffer(lifecycle, main)
    const ackBeforeClose = report.ipcEvents.filter((event) => event.channel === 'ack').length
    await send(main, 'ackPrompt', offer.prompt.id)
    await bounded(
      () => report.ipcEvents.filter((event) => event.channel === 'ack').length > ackBeforeClose,
    )
    main.destroy()
    try {
      await bounded(() => offer.settled, 1000)
    } catch {}
    report.checks.destroyedOwnerDropsAcknowledgedPrompt =
      offer.settled && offer.value === false && restarts === start
    if (!report.checks.destroyedOwnerDropsAcknowledgedPrompt)
      throw new Error('Acknowledged owner destruction left prompt pending')
    main = await createWindow('main', helper)
    start = restarts
    offer = await beginOffer(lifecycle, main)
    let ackCount = report.ipcEvents.filter((event) => event.channel === 'ack').length
    await send(main, 'ackPrompt', offer.prompt.id)
    await bounded(
      () => report.ipcEvents.filter((event) => event.channel === 'ack').length > ackCount,
    )
    await main.loadURL('data:text/html,<html><body>Private replacement page</body></html>')
    try {
      await bounded(() => offer.settled, 1000)
    } catch {}
    report.checks.navigationDropsAcknowledgedPrompt =
      offer.settled && offer.value === false && restarts === start
    if (!report.checks.navigationDropsAcknowledgedPrompt)
      throw new Error('Navigation left prompt pending')
    main.destroy()
    main = await createWindow('main', helper)
    start = restarts
    offer = await beginOffer(lifecycle, main)
    ackCount = report.ipcEvents.filter((event) => event.channel === 'ack').length
    await send(main, 'ackPrompt', offer.prompt.id)
    await bounded(
      () => report.ipcEvents.filter((event) => event.channel === 'ack').length > ackCount,
    )
    const crashedId = main.webContents.id
    main.webContents.forcefullyCrashRenderer()
    try {
      await bounded(() => offer.settled, 2000)
    } catch {}
    report.checks.rendererTerminationDropsAcknowledgedPrompt =
      offer.settled &&
      offer.value === false &&
      restarts === start &&
      report.windowEvents.some(
        (event) =>
          event.id === crashedId &&
          event.kind === 'render-process-gone' &&
          event.reason === 'killed',
      )
    if (!report.checks.rendererTerminationDropsAcknowledgedPrompt)
      throw new Error('Renderer termination contract failed')
    main.destroy()
    main = await createWindow('main', helper)
    start = restarts
    offer = await beginOffer(lifecycle, main)
    ackCount = report.ipcEvents.filter((event) => event.channel === 'ack').length
    await send(main, 'ackPrompt', offer.prompt.id)
    await bounded(
      () => report.ipcEvents.filter((event) => event.channel === 'ack').length > ackCount,
    )
    const abortId = main.webContents.id,
      ownedPid = main.webContents.getOSProcessId()
    if (ownedPid < 2 || ownedPid === process.pid) throw new Error('Owned renderer PID is not valid')
    process.kill(ownedPid, 'SIGABRT')
    try {
      await bounded(() => offer.settled, 3000)
    } catch {}
    report.checks.rendererCrashDropsAcknowledgedPrompt =
      offer.settled &&
      offer.value === false &&
      restarts === start &&
      report.windowEvents.some(
        (event) =>
          event.id === abortId &&
          event.kind === 'render-process-gone' &&
          event.reason === 'crashed',
      )
    if (!report.checks.rendererCrashDropsAcknowledgedPrompt)
      throw new Error('Owned renderer SIGABRT contract failed')
    main.destroy()
    report.checks.allNativeWindowsStayedHidden =
      !report.windowsWereVisible && windows.every((win) => win.isDestroyed() || !win.isVisible())
    report.restartCalls = restarts
    report.passed = Object.values(report.checks).every(Boolean)
  })
  .catch((error) => {
    report.passed = false
    report.failure = String(error?.message || error)
  })
  .finally(() => {
    report.deniedFiles = deniedFiles
    report.deniedNodeConnections = deniedNodeConnections
    fs.writeFileSync(
      path.join(root, 'native-report.json'),
      JSON.stringify(report, null, 2) + '\n',
      { mode: 0o600 },
    )
    for (const win of windows) if (!win.isDestroyed()) win.destroy()
    app.exit(report.passed ? 0 : 1)
  })
