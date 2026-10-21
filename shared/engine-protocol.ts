import { z } from 'zod'

/** Operations the Python engine understands. Keep in sync with python-engine/docuforge_engine/operations.py. */
export type EngineOperation =
  | 'inspect'
  | 'merge'
  | 'split'
  | 'organize_export'
  | 'thumbnails'
  | 'compress'
  | 'pdf_to_images'
  | 'images_to_pdf'
  | 'pdf_to_text'
  | 'text_to_pdf'
  | 'document_to_pdf'
  | 'pdf_to_docx'
  | 'ocr'
  | 'tools_status'

export interface EngineRequest {
  id: string
  op: EngineOperation
  args: Record<string, unknown>
}

/** Messages from the engine. They come from another process, so they are validated, not trusted. */
export const EngineMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('progress'),
    current: z.number().int().min(0),
    total: z.number().int().min(0).nullable(),
  }),
  z.object({ type: z.literal('result'), data: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal('error'), code: z.string(), message: z.string() }),
])
export type EngineMessage = z.infer<typeof EngineMessageSchema>

export type EngineOutcome =
  | { kind: 'result'; data: Record<string, unknown> }
  | { kind: 'error'; code: string; message: string }

export const InspectDataSchema = z.object({
  files: z.array(
    z.object({
      path: z.string(),
      ok: z.boolean(),
      pageCount: z.number().int().optional(),
      error: z.object({ code: z.string(), message: z.string() }).optional(),
    }),
  ),
})

export const OutputDataSchema = z.object({
  outputPaths: z.array(z.string()).min(1),
  sizeBytes: z.number().int().min(0),
  pageCount: z.number().int().optional(),
  outputDirectory: z.string().optional(),
  /** Size of the input, reported by compression so the app can show the saving. */
  originalBytes: z.number().int().min(0).optional(),
  /** A short, honest note about how the result was made or what to check. */
  note: z.string().max(600).optional(),
  /** The first part of recognized text (OCR only), shown to the user and never stored. */
  preview: z.string().max(4000).optional(),
})

export const ThumbnailsDataSchema = z.object({
  thumbnails: z.array(
    z.object({
      page: z.number().int().min(0),
      width: z.number().int().min(1),
      height: z.number().int().min(1),
      // Only JPEG data URLs are accepted, because the page puts this string in <img src>.
      dataUrl: z.string().startsWith('data:image/jpeg;base64,'),
    }),
  ),
})

export const ToolsStatusDataSchema = z.object({
  libreoffice: z.boolean(),
  tesseract: z.object({ found: z.boolean(), languages: z.array(z.string().max(30)).max(300) }),
})
