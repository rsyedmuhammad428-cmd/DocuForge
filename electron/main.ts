import { app, BrowserWindow, Menu, session } from 'electron'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { IPC_EVENTS } from '../shared/ipc'
import { registerIpcHandlers } from './ipc/register'
import { createTrustedUrlCheck } from './security'
import { resolveEngineCommand } from './services/engine-locator'
import { createEngineLauncher } from './services/engine-process'
import { FileRegistry } from './services/file-registry'
import { HistoryStore } from './services/history-store'
import { JobManager } from './services/job-manager'
import { PdfQueryService } from './services/pdf-service'
import { SettingsStore } from './services/settings-store'
import { sweepStaleTempFiles } from './services/temp-sweep'
import { removeStaleTempFiles } from './services/temp-cleanup'
import { applyThemePreference, windowBackgroundColor } from './services/theme'

const devServerUrl = app.isPackaged ? undefined : process.env['VITE_DEV_SERVER_URL']
const distDirectory = path.join(app.getAppPath(), 'dist')
const isTrustedUrl = createTrustedUrlCheck({ devServerUrl, distDirectory })

let mainWindow: BrowserWindow | null = null
let jobManager: JobManager | undefined
let historyStore: HistoryStore | undefined
let quitting = false

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1120,
    height: 720,
    minWidth: 960,
    minHeight: 600,
    title: 'DocuForge',
    // Shown on "ready-to-show" so the user never sees an unstyled or wrong-colored window.
    show: false,
    backgroundColor: windowBackgroundColor(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })

  window.once('ready-to-show', () => window.show())

  const entryUrl = devServerUrl ?? pathToFileURL(path.join(distDirectory, 'index.html')).toString()
  void window.loadURL(entryUrl)

  return window
}

/** Blocks navigation, pop-ups, embedded webviews, and permission prompts for every page. */
function hardenWebContents(): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
    contents.on('will-navigate', (event, url) => {
      if (!isTrustedUrl(url)) {
        event.preventDefault()
      }
    })
    contents.on('will-attach-webview', (event) => event.preventDefault())
  })

  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  )
  session.defaultSession.setPermissionCheckHandler(() => false)
}

function start(): void {
  const settings = new SettingsStore(path.join(app.getPath('userData'), 'settings.json'))
  applyThemePreference(settings.get().theme)

  hardenWebContents()

  const launcher = createEngineLauncher({
    // Tools shipped inside the installer (for example Tesseract) live in <resources>/tools.
    env: app.isPackaged ? { DOCUFORGE_TOOLS_DIR: path.join(process.resourcesPath, 'tools') } : {},
    resolveCommand: () =>
      resolveEngineCommand({
        isPackaged: app.isPackaged,
        appPath: app.getAppPath(),
        resourcesPath: process.resourcesPath,
        platform: process.platform,
        env: process.env,
      }),
  })
  const registry = new FileRegistry()
  const history = new HistoryStore(path.join(app.getPath('userData'), 'history.json'), {
    isEnabled: () => settings.get().saveHistory,
  })
  historyStore = history
  const jobs = new JobManager({
    launcher,
    maxConcurrent: 2,
    cleanupTempFiles: removeStaleTempFiles,
    onFinished: ({ snapshot, outputPaths, inputNames }) => {
      if (snapshot.status === 'running' || snapshot.status === 'queued') return
      history.record({
        id: snapshot.id,
        operation: snapshot.operation,
        title: snapshot.title,
        status: snapshot.status,
        finishedAt: snapshot.finishedAt ?? Date.now(),
        inputNames: inputNames.slice(0, 20),
        outputName: snapshot.result?.firstFileName ?? null,
        outputPath: outputPaths[0] ?? null,
        outputLocation: snapshot.result?.location ?? null,
        outputCount: snapshot.result?.fileCount ?? 0,
        totalBytes: snapshot.result?.totalBytes ?? null,
        errorMessage: snapshot.error?.message.slice(0, 300) ?? null,
      })
    },
    onChange: (snapshot) => {
      if (mainWindow !== null && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_EVENTS.jobUpdated, snapshot)
      }
    },
  })
  jobManager = jobs

  registerIpcHandlers({
    appInfo: {
      name: app.getName(),
      version: app.getVersion(),
      electronVersion: process.versions.electron,
    },
    settings,
    registry,
    jobs,
    history,
    pdf: new PdfQueryService(registry, launcher),
    isTrustedUrl,
    onThemeChanged: applyThemePreference,
  })

  if (settings.get().cleanupTempFiles) {
    // Runs in the background. Only old files with the engine's own names are touched.
    void sweepStaleTempFiles({
      directories: [...history.outputDirectories(), ...(settings.get().defaultOutputFolder === null ? [] : [settings.get().defaultOutputFolder as string])],
      systemTempDirectory: tmpdir(),
      maxAgeMs: 60 * 60 * 1000,
    }).catch(() => undefined)
  }

  if (app.isPackaged) {
    // The default menu only adds developer shortcuts. Keep it in development builds.
    Menu.setApplicationMenu(null)
  }

  mainWindow = createMainWindow()
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow === null) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.on('window-all-closed', () => app.quit())

  // Quitting while jobs run: stop them cleanly first so no half-written files are left behind.
  app.on('before-quit', (event) => {
    if (quitting || jobManager === undefined || !jobManager.hasActiveJobs()) return
    event.preventDefault()
    quitting = true
    void jobManager
      .shutdown()
      .then(() => historyStore?.flush())
      .finally(() => app.quit())
  })

  void app.whenReady().then(start)
}
