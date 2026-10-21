import { z } from 'zod'

/**
 * One finished job. History stores file NAMES and where the result was saved, never the contents
 * of any document, and never the text OCR recognized.
 */
export const HistoryEntrySchema = z.object({
  id: z.string().min(1).max(100),
  operation: z.string().min(1).max(40),
  title: z.string().max(300),
  status: z.enum(['succeeded', 'failed', 'cancelled']),
  finishedAt: z.number().int().min(0),
  inputNames: z.array(z.string().max(300)).max(20),
  outputName: z.string().max(300).nullable(),
  /** Full path of the first result. Used only by the main process, to open it later. */
  outputPath: z.string().max(2000).nullable(),
  /** Folder shown to the user. */
  outputLocation: z.string().max(2000).nullable(),
  outputCount: z.number().int().min(0),
  totalBytes: z.number().int().min(0).nullable(),
  errorMessage: z.string().max(300).nullable(),
})
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>

/** What the page sees: no full path, plus whether the result still exists on disk right now. */
export type HistoryEntryView = Omit<HistoryEntry, 'outputPath'> & { available: boolean }
