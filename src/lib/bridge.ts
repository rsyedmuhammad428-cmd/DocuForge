import type { FileKind, FileRef, InspectResult, OutputFileKind, OutputRef, PageThumbnail } from '../../shared/files'
import type { HistoryEntryView } from '../../shared/history'
import type { AppInfo, IpcResult, ToolsStatus } from '../../shared/ipc'
import type { JobRequest, JobSnapshot } from '../../shared/jobs'
import type { Settings, SettingsUpdate } from '../../shared/settings'

export class BridgeError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'BridgeError'
    this.code = code
  }
}

function getApi() {
  const api = window.docuforge
  if (api === undefined) {
    throw new BridgeError(
      'BRIDGE_UNAVAILABLE',
      'DocuForge must run inside the desktop app. Start it with "npm run dev".',
    )
  }
  return api
}

async function unwrap<T>(request: Promise<IpcResult<T>>): Promise<T> {
  const result = await request
  if (!result.ok) {
    throw new BridgeError(result.error.code, result.error.message)
  }
  return result.data
}

/** Typed, promise-based access to the main process. Components never touch window.docuforge directly. */
export const bridge = {
  getAppInfo: (): Promise<AppInfo> => unwrap(getApi().app.getInfo()),

  getSettings: (): Promise<Settings> => unwrap(getApi().settings.get()),
  updateSettings: (patch: SettingsUpdate): Promise<Settings> =>
    unwrap(getApi().settings.update(patch)),
  chooseOutputFolder: (): Promise<Settings> => unwrap(getApi().settings.chooseOutputFolder()),

  selectFiles: (kind: FileKind, multiple: boolean): Promise<FileRef[]> =>
    unwrap(getApi().files.selectFiles({ kind, multiple })),
  selectPdfs: (multiple: boolean): Promise<FileRef[]> =>
    unwrap(getApi().files.selectFiles({ kind: 'pdf', multiple })),
  releaseFiles: async (ids: string[]): Promise<void> => {
    await unwrap(getApi().files.release(ids))
  },
  selectOutputFile: (suggestedName: string, kind: OutputFileKind = 'pdf'): Promise<OutputRef | null> =>
    unwrap(getApi().output.selectFile({ suggestedName, kind })),
  selectOutputFolder: (): Promise<OutputRef | null> => unwrap(getApi().output.selectFolder()),

  inspectPdfs: (fileIds: string[]): Promise<InspectResult[]> =>
    unwrap(getApi().pdf.inspect(fileIds)),
  getThumbnails: (fileId: string, pages: number[], width?: number): Promise<PageThumbnail[]> =>
    unwrap(getApi().pdf.thumbnails(fileId, pages, width)),

  listHistory: (): Promise<HistoryEntryView[]> => unwrap(getApi().history.list()),
  clearHistory: async (): Promise<void> => {
    await unwrap(getApi().history.clear())
  },
  openHistoryEntry: async (entryId: string): Promise<void> => {
    await unwrap(getApi().history.open(entryId))
  },
  revealHistoryEntry: async (entryId: string): Promise<void> => {
    await unwrap(getApi().history.reveal(entryId))
  },

  getToolsStatus: (): Promise<ToolsStatus> => unwrap(getApi().tools.status()),

  startJob: async (request: JobRequest): Promise<string> =>
    (await unwrap(getApi().jobs.start(request))).jobId,
  cancelJob: async (jobId: string): Promise<void> => {
    await unwrap(getApi().jobs.cancel(jobId))
  },
  listJobs: (): Promise<JobSnapshot[]> => unwrap(getApi().jobs.list()),
  revealJobOutput: async (jobId: string): Promise<void> => {
    await unwrap(getApi().jobs.revealOutput(jobId))
  },
  openJobOutput: async (jobId: string): Promise<void> => {
    await unwrap(getApi().jobs.openOutput(jobId))
  },
  onJobUpdated: (listener: (snapshot: JobSnapshot) => void): (() => void) =>
    getApi().jobs.onUpdated(listener),
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.'
}
