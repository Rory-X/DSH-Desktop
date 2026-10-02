// Isolated native lifecycle probe: no DSH profile or production window is used.
const { app, BrowserWindow, ipcMain } = require('electron')
const assert = require('node:assert/strict')
const { createServer } = require('node:http')
const { mkdtempSync, appendFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

const home = mkdtempSync(join(tmpdir(), 'dsh-overlay-restart-'))
app.setPath('userData', join(home, 'userData'))
const logFile = join(home, 'probe.log')
const log = (value) => {
  const line = JSON.stringify({ at: Date.now(), ...value })
  appendFileSync(logFile, line + '\n')
  console.log(line)
}
const handlers = new Map()
const handle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (name, callback) => {
  handlers.set(name, callback)
  handle(name, callback)
}
const showInactive = BrowserWindow.prototype.showInactive
BrowserWindow.prototype.showInactive = function () {
  log({
    action: 'showInactive',
    id: this.id,
    destroyed: this.isDestroyed(),
    contentsDestroyed: this.webContents.isDestroyed(),
  })
  return showInactive.call(this)
}
const { setupDesktopOverlays, closeAllOverlays } = require('../dist/desktop-overlays')
const { Ipc } = require('../dist/ipc')
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const server = createServer((req, res) => {
  setTimeout(
    () => {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<!doctype html><title>Isolated overlay probe</title>')
    },
    req.url.includes('slow') ? 120 : 5,
  )
})
const watchdog = setTimeout(() => app.exit(2), 30000)

app
  .whenReady()
  .then(async () => {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${server.address().port}`
    setupDesktopOverlays(() => origin)
    const owner = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
    await owner.loadURL('data:text/html,probe')
    const event = { sender: owner.webContents }
    const open = (id, url) =>
      handlers.get(Ipc.overlays.open)(event, {
        contributor: 'restart-probe',
        id,
        url,
        bounds: { width: 64, height: 64 },
        chrome: { frame: false, transparent: true, skipTaskbar: true },
      })
    log({ action: 'start', home })
    for (let i = 0; i < 40; i += 1) {
      const first = Promise.allSettled([open(`first-${i}`, `/slow?round=${i}`)])
      await delay(5)
      const second = Promise.allSettled([open(`second-${i}`, `/fast?round=${i}`)])
      if (i % 2 === 0) {
        await delay(2)
        closeAllOverlays()
      }
      const result = (await Promise.all([first, second])).flat()
      log({
        action: 'round',
        i,
        results: result.map((r) => (r.status === 'fulfilled' ? 'ok' : r.reason.message)),
      })
      if (i % 2 === 0) {
        for (const entry of result) {
          assert.equal(entry.status, 'rejected')
          assert.match(entry.reason.message, /closed while loading/)
        }
      } else {
        assert.deepEqual(
          result.map((entry) => entry.status),
          ['fulfilled', 'fulfilled'],
        )
      }
      closeAllOverlays()
      await delay(10)
    }
    clearTimeout(watchdog)
    server.closeAllConnections()
    server.close()
    owner.destroy()
    log({ action: 'complete' })
    app.exit(0)
  })
  .catch((error) => {
    log({ action: 'error', message: error.stack })
    app.exit(1)
  })
