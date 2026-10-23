import type { FileKind, FileRef, InspectResult, OutputFileKind, OutputRef, PageThumbnail } from './files'
import type { HistoryEntryView } from './history'
import type { JobRequest, JobSnapshot } from './jobs'
import type { Settings, SettingsUpdate } from './settings'

/** Every IPC channel the app uses. Add new channels here and nowhere else. */
export const IPC_CHANNELS = {
  appGetInfo: 'app:get-info',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  settingsChooseOutputFolder: 'settings:choose-output-folder',
  filesSelect: 'files:select',
  filesRelease: 'files:release',
  outputSelectFile: 'output:select-file',
  outputSelectFolder: 'output:select-folder',
  pdfInspect: 'pdf:inspect',
  pdfThumbnails: 'pdf:thumbnails',
  toolsStatus: 'tools:status',
  historyList: 'history:list',
  historyClear: 'history:clear',
  historyOpen: 'history:open',
  historyReveal: 'history:reveal',
  jobsStart: 'jobs:start',
  jobsCancel: 'jobs:cancel',
  jobsList: 'jobs:list',
  jobsRevealOutput: 'jobs:reveal-output',
  jobsOpenOutput: 'jobs:open-output',
} as const

/** Messages pushed from the main process to the page. */
export const IPC_EVENTS = {
  jobUpdated: 'jobs:updated',
} as const

/**
 * INVALID_REQUEST   the request was malformed or referred to something unknown
 * FORBIDDEN         the request did not come from the app's own page
 * OPERATION_FAILED  a normal failure with a message that is safe to show the user
 * INTERNAL          an unexpected failure; details are logged, not sent
 */
export type IpcErrorCode = 'INVALID_REQUEST' | 'FORBIDDEN' | 'OPERATION_FAILED' | 'INTERNAL'

export interface IpcError {
  code: IpcErrorCode
  message: string
}

/** Every handler returns this shape, so the renderer never has to catch raw IPC exceptions. */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError }

export interface ToolsStatus {
  /** Optional. Gives exact layout and line breaks for Word to PDF using Microsoft Word. */
  word: boolean
  /** Optional. Gives a closer layout for Word to PDF and adds .doc, .odt and .rtf. */
  libreoffice: boolean
  /** Needed for OCR. `languages` are the installed language packs, for example "eng". */
  tesseract: { found: boolean; languages: string[] }
}

export interface AppInfo {
  name: string
  version: string
  electronVersion: string
}

/** The only API the preload script exposes to the renderer as `window.docuforge`. */
export interface DocuForgeApi {
  app: {
    getInfo(): Promise<IpcResult<AppInfo>>
  }
  settings: {
    get(): Promise<IpcResult<Settings>>
    update(patch: SettingsUpdate): Promise<IpcResult<Settings>>
    /** Opens a folder dialog and saves the choice as the default output folder. */
    chooseOutputFolder(): Promise<IpcResult<Settings>>
  }
  files: {
    /** Opens a native dialog. Returns an empty list if the user cancels. */
    selectFiles(options: { kind: FileKind; multiple: boolean }): Promise<IpcResult<FileRef[]>>
    release(ids: string[]): Promise<IpcResult<null>>
  }
  output: {
    /** Save dialog. Returns null if the user cancels. */
    selectFile(options: { suggestedName: string; kind: OutputFileKind }): Promise<IpcResult<OutputRef | null>>
    /** Folder dialog. Returns null if the user cancels. */
    selectFolder(): Promise<IpcResult<OutputRef | null>>
  }
  pdf: {
    inspect(fileIds: string[]): Promise<IpcResult<InspectResult[]>>
    thumbnails(fileId: string, pages: number[], width?: number): Promise<IpcResult<PageThumbnail[]>>
  }
  tools: {
    /** Which optional programs were found on this computer. */
    status(): Promise<IpcResult<ToolsStatus>>
  }
  history: {
    list(): Promise<IpcResult<HistoryEntryView[]>>
    clear(): Promise<IpcResult<null>>
    open(entryId: string): Promise<IpcResult<null>>
    reveal(entryId: string): Promise<IpcResult<null>>
  }
  jobs: {
    start(request: JobRequest): Promise<IpcResult<{ jobId: string }>>
    cancel(jobId: string): Promise<IpcResult<null>>
    list(): Promise<IpcResult<JobSnapshot[]>>
    revealOutput(jobId: string): Promise<IpcResult<null>>
    openOutput(jobId: string): Promise<IpcResult<null>>
    /** Subscribes to job updates. Returns a function that unsubscribes. */
    onUpdated(listener: (snapshot: JobSnapshot) => void): () => void
  }
}
