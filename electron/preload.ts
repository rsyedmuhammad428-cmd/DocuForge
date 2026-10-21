import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, IPC_EVENTS, type DocuForgeApi } from '../shared/ipc'

/**
 * The renderer's only connection to the main process. Each method maps to one
 * named channel. No generic "send" or "invoke" is exposed, and Node.js APIs
 * are not available to the page.
 */
const api: DocuForgeApi = {
  app: {
    getInfo: () => ipcRenderer.invoke(IPC_CHANNELS.appGetInfo),
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGet),
    update: (patch) => ipcRenderer.invoke(IPC_CHANNELS.settingsUpdate, patch),
    chooseOutputFolder: () => ipcRenderer.invoke(IPC_CHANNELS.settingsChooseOutputFolder),
  },
  files: {
    selectFiles: (options) => ipcRenderer.invoke(IPC_CHANNELS.filesSelect, options),
    release: (ids) => ipcRenderer.invoke(IPC_CHANNELS.filesRelease, ids),
  },
  output: {
    selectFile: (options) => ipcRenderer.invoke(IPC_CHANNELS.outputSelectFile, options),
    selectFolder: () => ipcRenderer.invoke(IPC_CHANNELS.outputSelectFolder),
  },
  pdf: {
    inspect: (fileIds) => ipcRenderer.invoke(IPC_CHANNELS.pdfInspect, fileIds),
    thumbnails: (fileId, pages, width) =>
      ipcRenderer.invoke(IPC_CHANNELS.pdfThumbnails, { fileId, pages, width }),
  },
  tools: {
    status: () => ipcRenderer.invoke(IPC_CHANNELS.toolsStatus),
  },
  history: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.historyList),
    clear: () => ipcRenderer.invoke(IPC_CHANNELS.historyClear),
    open: (entryId) => ipcRenderer.invoke(IPC_CHANNELS.historyOpen, entryId),
    reveal: (entryId) => ipcRenderer.invoke(IPC_CHANNELS.historyReveal, entryId),
  },
  jobs: {
    start: (request) => ipcRenderer.invoke(IPC_CHANNELS.jobsStart, request),
    cancel: (jobId) => ipcRenderer.invoke(IPC_CHANNELS.jobsCancel, jobId),
    list: () => ipcRenderer.invoke(IPC_CHANNELS.jobsList),
    revealOutput: (jobId) => ipcRenderer.invoke(IPC_CHANNELS.jobsRevealOutput, jobId),
    openOutput: (jobId) => ipcRenderer.invoke(IPC_CHANNELS.jobsOpenOutput, jobId),
    onUpdated: (listener) => {
      // The raw Electron event is not passed on to the page.
      const handler = (_event: unknown, snapshot: Parameters<typeof listener>[0]): void => listener(snapshot)
      ipcRenderer.on(IPC_EVENTS.jobUpdated, handler)
      return () => {
        ipcRenderer.removeListener(IPC_EVENTS.jobUpdated, handler)
      }
    },
  },
}

contextBridge.exposeInMainWorld('docuforge', api)
