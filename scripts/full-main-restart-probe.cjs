const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process')
const { app, BrowserWindow, dialog, session, shell, Notification, ipcMain } = require('electron')
const root = process.env.DSH_FULL_ROOT, plan = JSON.parse(fs.readFileSync(path.join(root, 'plan.json'), 'utf8'))
const packaged = !!process.env.DSH_FULL_PACKAGED_APP
if (packaged) plan.app = app.getAppPath()
const nodeBinary = packaged ? path.join(process.resourcesPath, 'runtime/bin/node') : path.join(plan.app, 'runtime/bin/node')
const report = { generatedAt: new Date().toISOString(), kind: 'full-desktop-main-with-real-dsh-child', checks: {}, phases: [],
  children: [], nativeCalls: [], isPackaged: app.isPackaged, suppressedVisualActions: 0, visibleWindowObserved: false, blockedRendererRequests: 0, errors: [], passed: false }
const pause = ms => new Promise(resolve => setTimeout(resolve, ms)), childHandles = []
const originalSpawn = cp.spawn
cp.spawn = function(file, args, options) {
  if (file !== nodeBinary || args[0] !== plan.entry) throw new Error('Full Desktop probe denied unrelated subprocess')
  const sequence = report.children.length + 1
  const env = { ...options.env, DSH_REHEARSAL_OBSERVER: path.join(root, 'observer-' + sequence + '.json'), DSH_FULL_NETWORK: path.join(root, 'network-' + sequence + '.json') }
  const child = originalSpawn.call(this, file, args, { ...options, env })
  const record = { pid: child.pid, sequence, port: Number(args[args.indexOf('--port') + 1]), exited: false }
  child.on('exit', (code, signal) => { record.exited = true; record.exitCode = code; record.signal = signal })
  report.children.push(record); childHandles.push(child)
  return child
}
require('node:module').syncBuiltinESMExports()
const handle = ipcMain.handle
ipcMain.handle = function(channel, listener) {
  if (channel !== 'desktop:updates:restart-web') return handle.call(this, channel, listener)
  return handle.call(this, channel, function(event, ...args) {
    const record = { sender: event.sender.id, completed: false }, result = listener(event, ...args)
    report.nativeCalls.push(record)
    Promise.resolve(result).then(() => { record.completed = true; record.ok = true }, error => { record.completed = true; record.ok = false; record.message = String(error.message) })
    return result
  })
}
for (const name of ['appData', 'userData', 'sessionData', 'logs', 'crashDumps']) { const directory = path.join(root, 'native-' + name); fs.mkdirSync(directory); app.setPath(name, directory) }
app.setActivationPolicy('prohibited'); app.commandLine.appendSwitch('disable-background-networking')
// Let main's before-quit handlers run while retaining time to observe child exit.
app.on('before-quit', event => event.preventDefault())
app.on('browser-window-created', (_event, win) => win.on('show', () => { report.visibleWindowObserved = true; win.hide() }))
for (const name of ['show', 'showInactive']) BrowserWindow.prototype[name] = function() { report.suppressedVisualActions++ }
if (Notification) Notification.prototype.show = function() { report.suppressedVisualActions++ }
dialog.showErrorBox = (_title, text) => report.errors.push(String(text).split('\n')[0])
shell.openExternal = async () => { throw new Error('Private Desktop denied external browser') }
const windows = require(path.join(plan.app, 'dist/windows.js')), dock = require(path.join(plan.app, 'dist/dock-policy.js'))
for (const name of ['focusMainWindow', 'focusWindow']) windows[name] = () => { report.suppressedVisualActions++ }
for (const name of ['startDockPolicyGuard', 'enforceRegularDockPolicy']) dock[name] = () => { report.suppressedVisualActions++ }
async function bounded(predicate, timeout = 15000) { const deadline = Date.now() + timeout; while (Date.now() < deadline) { if (await predicate()) return; await pause(100) } throw new Error('Full Desktop bounded barrier expired') }
async function status() { try { return await (await fetch('http://127.0.0.1:' + plan.proxyPort + '/dsh-proxy/api/status', { signal: AbortSignal.timeout(700) })).json() } catch { return null } }
async function ready(name, expected = plan.buildId) {
  let snapshot
  await bounded(async () => {
    const current = report.children.at(-1), state = await status()
    if (!current || !state || current.exited || state.buildId !== expected || state.entry.pid !== current.pid) return false
    const observer = path.join(root, 'observer-' + current.sequence + '.json')
    if (!fs.existsSync(observer)) return false
    const observed = JSON.parse(fs.readFileSync(observer, 'utf8'))
    if (!observed.rows || observed.rows.length !== plan.fixture.entryCount + 1 || observed.pendingLoaderTasks !== 0 || observed.terminalContract !== 2
      || observed.bodyGuardRegistrations < 1 || observed.rows.some(row => !row.disabled && row.state !== 2)) return false
    fs.writeFileSync(path.join(root, name + '-ready.json'), JSON.stringify(observed, null, 2) + '\n', { mode: 0o600 })
    snapshot = { name, pid: current.pid, buildId: state.buildId, rows: observed.rows.length, activeRows: observed.rows.filter(row => !row.disabled && row.state === 2).length,
      terminalContract: observed.terminalContract, bodyGuards: observed.bodyGuardRegistrations }
    return true
  }, 25000)
  report.phases.push(snapshot)
  await bounded(() => !!windows.getMainWindow())
  const win = windows.getMainWindow()
  await bounded(async () => { try { return await win.webContents.executeJavaScript('typeof window.dshDesktop?.updates?.restartWeb === "function"') } catch { return false } })
  return win
}
async function invoke(win, count = 1) {
  const before = report.nativeCalls.length
  await win.webContents.executeJavaScript(`for(let i=0;i<${count};i++)window.dshDesktop.updates.restartWeb().catch(()=>{});true;`)
  await bounded(() => report.nativeCalls.length === before + count && report.nativeCalls.slice(before).every(call => call.completed), 40000)
  return report.nativeCalls.slice(before)
}
const main = path.join(plan.app, 'dist/main.js')
app.whenReady().then(() => {
  app.dock?.hide()
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    let local = /^(file:|data:|blob:|about:)/.test(details.url)
    try { const url = new URL(details.url); local ||= url.hostname === '127.0.0.1' && report.children.some(child => String(child.port) === url.port) } catch {}
    if (!local) report.blockedRendererRequests++
    callback({ cancel: !local })
  })
})
require(main)
;(async () => {
  let win = await ready('candidate')
  const first = report.children.at(-1), firstWindow = win.id
  const [restarted] = await invoke(win)
  win = await ready('restarted')
  report.checks.nativeInvokeRestartsActualChild = restarted.ok && report.children.at(-1).pid !== first.pid && first.exited
  report.checks.mainWindowSurvivesReload = win.id === firstWindow
  const callsBefore = report.children.length
  const concurrent = await invoke(win, 2)
  win = await ready('concurrent-restart')
  report.checks.concurrentRestartCoalesces = concurrent.every(call => call.ok) && report.children.length === callsBefore + 1
  fs.writeFileSync(plan.entry, 'INVALID PRIVATE DSH ENTRY\n')
  const [failed] = await invoke(win)
  await bounded(() => report.children.at(-1).exited)
  report.checks.badEntryRejectsNativeInvoke = !failed.ok && /重启失败/.test(failed.message)
  report.phases.push({ name: 'failed-restart', rejected: !failed.ok, childExited: report.children.at(-1).exited })
  fs.copyFileSync(path.join(root, 'original-bin.js'), plan.entry)
  const [restored] = await invoke(win)
  win = await ready('recovered')
  report.checks.restoredEntryRecoversViaSameNativeWindow = restored.ok && win.id === firstWindow
  fs.rmSync(path.join(plan.plugin, 'lib'), { recursive: true }); fs.cpSync(path.join(plan.release, 'previous/lib'), path.join(plan.plugin, 'lib'), { recursive: true })
  const oldId = fs.readFileSync(path.join(plan.plugin, 'lib/index.js'), 'utf8').match(/PROXY_BUILD_ID\s*=\s*"([a-f0-9]{16})"/)?.[1]
  for (const { core, destination } of plan.coreRoots) fs.copyFileSync(core.backup, path.join(destination, 'lib/index.js'))
  const hash = file => require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  report.checks.rollbackCoreHashesMatch = plan.coreRoots.every(({core,destination}) => hash(path.join(destination, 'lib/index.js')) === core.before)
  await invoke(win); win = await ready('rolled-back', oldId)
  report.checks.oldBuildRestoredThroughActualMain = oldId !== plan.buildId
  fs.rmSync(path.join(plan.plugin, 'lib'), { recursive: true }); fs.cpSync(path.join(plan.release, 'stage/lib'), path.join(plan.plugin, 'lib'), { recursive: true })
  for (const { core, destination } of plan.coreRoots) fs.copyFileSync(core.staged, path.join(destination, 'lib/index.js'))
  report.checks.reappliedCoreHashesMatch = plan.coreRoots.every(({core,destination}) => hash(path.join(destination, 'lib/index.js')) === core.after)
  await invoke(win); await ready('reapplied')
  report.checks.candidateReappliedThroughActualMain = true
  report.checks.onlyOwnedChildrenStarted = report.children.every(child => child.pid > 1)
  report.checks.windowsStayedHidden = !report.visibleWindowObserved && BrowserWindow.getAllWindows().every(win => !win.isVisible())
  const layouts = report.phases.filter(phase => phase.pid).map(phase => JSON.stringify(JSON.parse(fs.readFileSync(path.join(root, phase.name + '-ready.json'), 'utf8')).rows.map(row => ({id:row.id,name:row.name,disabled:row.disabled,state:row.state}))))
  report.checks.loadedStatesMatchAcrossRestarts = new Set(layouts).size === 1
  if (packaged) report.checks.actualPackagedBranch = app.isPackaged
  report.passed = Object.values(report.checks).every(Boolean)
})().catch(error => { report.failure = String(error?.message || error); report.passed = false }).finally(async () => {
  fs.copyFileSync(path.join(root, 'original-bin.js'), plan.entry)
  app.quit()
  for (const child of childHandles) if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
  try { await bounded(() => childHandles.every(child => child.exitCode !== null || child.signalCode !== null), 5000) } catch {
    for (const child of childHandles) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    await pause(300)
  }
  report.childrenAllExited = childHandles.every(child => child.exitCode !== null || child.signalCode !== null)
  fs.writeFileSync(path.join(root, 'native-result.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
  app.exit(report.passed && report.childrenAllExited ? 0 : 1)
})
