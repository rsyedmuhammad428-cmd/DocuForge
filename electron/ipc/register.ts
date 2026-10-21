import { IPC_CHANNELS, type AppInfo } from '../../shared/ipc'
import { SettingsUpdateSchema, type Settings, type ThemePreference } from '../../shared/settings'
import type { FileRegistry } from '../services/file-registry'
import type { HistoryStore } from '../services/history-store'
import type { JobManager } from '../services/job-manager'
import type { PdfQueryService } from '../services/pdf-service'
import type { SettingsStore } from '../services/settings-store'
import { registerFileHandlers } from './files'
import { registerHistoryHandlers } from './history'
import { createHandlerRegistrar, noInput } from './handler'
import { registerJobHandlers } from './jobs'
import { registerPdfHandlers } from './pdf'

export interface IpcDependencies {
  appInfo: AppInfo
  settings: SettingsStore
  registry: FileRegistry
  jobs: JobManager
  history: HistoryStore
  pdf: PdfQueryService
  isTrustedUrl: (url: string) => boolean
  onThemeChanged: (theme: ThemePreference) => void
}

/** The one place every IPC channel is wired up. */
export function registerIpcHandlers(deps: IpcDependencies): void {
  const handle = createHandlerRegistrar(deps.isTrustedUrl)

  handle(IPC_CHANNELS.appGetInfo, noInput, () => deps.appInfo)

  handle(IPC_CHANNELS.settingsGet, noInput, (): Settings => deps.settings.get())

  handle(
    IPC_CHANNELS.settingsUpdate,
    (raw) => SettingsUpdateSchema.parse(raw),
    async (patch): Promise<Settings> => {
      const updated = await deps.settings.update(patch)
      deps.onThemeChanged(updated.theme)
      return updated
    },
  )

  registerFileHandlers(handle, { registry: deps.registry, settings: deps.settings })
  registerPdfHandlers(handle, deps.pdf)
  registerJobHandlers(handle, { jobs: deps.jobs, registry: deps.registry })
  registerHistoryHandlers(handle, deps.history)
}
