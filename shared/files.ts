/** The kinds of input file a native "open" dialog can offer. */
export const FILE_KINDS = {
  pdf: { label: 'PDF documents', extensions: ['pdf'] },
  image: { label: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'tif', 'tiff', 'webp'] },
  text: { label: 'Text files', extensions: ['txt'] },
  document: { label: 'Word and OpenDocument files', extensions: ['docx', 'doc', 'odt', 'rtf'] },
} as const
export type FileKind = keyof typeof FILE_KINDS

/** What a "save as" dialog can create. */
export type OutputFileKind = 'pdf' | 'text' | 'word'

export const OUTPUT_KINDS: Record<OutputFileKind, { label: string; extension: string }> = {
  pdf: { label: 'PDF documents', extension: 'pdf' },
  text: { label: 'Text files', extension: 'txt' },
  word: { label: 'Word documents', extension: 'docx' },
}

/** A file the user picked. The page only ever sees an opaque id, never a path it could reuse. */
export interface FileRef {
  id: string
  name: string
  sizeBytes: number
}

/** A place the user chose to save to: a file (save dialog) or a folder. */
export interface OutputRef {
  id: string
  /** File name, or folder name. */
  name: string
  /** Folder shown to the user. */
  location: string
}

export interface InspectResult {
  fileId: string
  ok: boolean
  pageCount: number | null
  error: { code: string; message: string } | null
}

export interface PageThumbnail {
  /** Zero-based page index. */
  page: number
  width: number
  height: number
  dataUrl: string
}
