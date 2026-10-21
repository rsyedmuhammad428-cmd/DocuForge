import type { DocuForgeApi } from '../../shared/ipc'

declare global {
  interface Window {
    /** Provided by the Electron preload script. Missing when the page runs in a plain browser. */
    docuforge?: DocuForgeApi
  }
}
