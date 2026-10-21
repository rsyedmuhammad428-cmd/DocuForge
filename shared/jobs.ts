import { z } from 'zod'
import type { JobStatus } from './job-state'

const MAX_INPUT_FILES = 200
const MAX_RANGES = 1000
const MAX_ORGANIZE_PAGES = 100_000

export const PageRangeSchema = z.object({
  start: z.number().int().min(1),
  end: z.number().int().min(1),
})

export const OrganizePageSchema = z.object({
  /** Zero-based index of the page in the source PDF. */
  index: z.number().int().min(0),
  /** Extra clockwise rotation to apply, in degrees. */
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
})

const MergeRequestSchema = z.object({
  operation: z.literal('merge'),
  inputIds: z.array(z.string().min(1)).min(2).max(MAX_INPUT_FILES),
  outputId: z.string().min(1),
})

const SplitRequestSchema = z
  .object({
    operation: z.literal('split'),
    inputId: z.string().min(1),
    outputId: z.string().min(1),
    mode: z.enum(['extract', 'ranges', 'each', 'chunks']),
    ranges: z.array(PageRangeSchema).min(1).max(MAX_RANGES).optional(),
    chunkSize: z.number().int().min(1).optional(),
  })
  .superRefine((request, context) => {
    if ((request.mode === 'extract' || request.mode === 'ranges') && request.ranges === undefined) {
      context.addIssue({ code: 'custom', message: 'Page ranges are required.', path: ['ranges'] })
    }
    if (request.mode === 'chunks' && request.chunkSize === undefined) {
      context.addIssue({ code: 'custom', message: 'A chunk size is required.', path: ['chunkSize'] })
    }
  })

const OrganizeRequestSchema = z.object({
  operation: z.literal('organize'),
  inputId: z.string().min(1),
  outputId: z.string().min(1),
  pages: z.array(OrganizePageSchema).min(1).max(MAX_ORGANIZE_PAGES),
})

export const COMPRESSION_PRESETS = ['light', 'balanced', 'smallest'] as const
export type CompressionPreset = (typeof COMPRESSION_PRESETS)[number]

const PdfToImagesRequestSchema = z.object({
  operation: z.literal('pdf_to_images'),
  inputId: z.string().min(1),
  outputId: z.string().min(1),
  format: z.enum(['png', 'jpeg']),
  dpi: z.number().int().min(72).max(300),
  /** Pages to convert. Omit for every page. */
  ranges: z.array(PageRangeSchema).min(1).max(MAX_RANGES).optional(),
})

const ImagesToPdfRequestSchema = z.object({
  operation: z.literal('images_to_pdf'),
  inputIds: z.array(z.string().min(1)).min(1).max(MAX_INPUT_FILES),
  outputId: z.string().min(1),
  pageSize: z.enum(['a4', 'match']),
})

const PdfToTextRequestSchema = z.object({
  operation: z.literal('pdf_to_text'),
  inputId: z.string().min(1),
  outputId: z.string().min(1),
  pageMarkers: z.boolean(),
  ranges: z.array(PageRangeSchema).min(1).max(MAX_RANGES).optional(),
})

const TextToPdfRequestSchema = z.object({
  operation: z.literal('text_to_pdf'),
  inputId: z.string().min(1),
  outputId: z.string().min(1),
})

const DocumentToPdfRequestSchema = z.object({
  operation: z.literal('document_to_pdf'),
  inputId: z.string().min(1),
  outputId: z.string().min(1),
})

const PdfToDocxRequestSchema = z.object({
  operation: z.literal('pdf_to_docx'),
  inputId: z.string().min(1),
  outputId: z.string().min(1),
  ranges: z.array(PageRangeSchema).min(1).max(MAX_RANGES).optional(),
})

const OcrRequestSchema = z.object({
  operation: z.literal('ocr'),
  inputId: z.string().min(1),
  outputId: z.string().min(1),
  /** text: a .txt file. pdf: a searchable PDF. */
  format: z.enum(['text', 'pdf']),
  languages: z.array(z.string().regex(/^[A-Za-z0-9_]{2,30}$/)).min(1).max(5),
  dpi: z.number().int().min(150).max(400),
  /** For PDFs: use the text a page already has instead of recognizing it again. */
  useExistingText: z.boolean(),
  pageMarkers: z.boolean(),
  ranges: z.array(PageRangeSchema).min(1).max(MAX_RANGES).optional(),
})

const CompressRequestSchema = z.object({
  operation: z.literal('compress'),
  inputId: z.string().min(1),
  outputId: z.string().min(1),
  preset: z.enum(COMPRESSION_PRESETS),
})

/** Everything the page may ask for. File and folder ids come from the dialogs in the main process. */
export const JobRequestSchema = z.discriminatedUnion('operation', [
  MergeRequestSchema,
  SplitRequestSchema,
  OrganizeRequestSchema,
  PdfToImagesRequestSchema,
  ImagesToPdfRequestSchema,
  PdfToTextRequestSchema,
  TextToPdfRequestSchema,
  DocumentToPdfRequestSchema,
  PdfToDocxRequestSchema,
  OcrRequestSchema,
  CompressRequestSchema,
])
export type JobRequest = z.infer<typeof JobRequestSchema>
export type JobOperation = JobRequest['operation']

export interface JobProgress {
  current: number
  /** null when the engine cannot report a reliable total. */
  total: number | null
}

export interface JobResultSummary {
  fileCount: number
  firstFileName: string
  /** Folder that contains the result. */
  location: string
  totalBytes: number
  pageCount: number | null
  /** Size before compression. null for jobs that do not report it. */
  originalBytes: number | null
  /** A short note from the engine, for example how the result was made. */
  note: string | null
  /** The first part of recognized text (OCR). Only held in memory for this session. */
  preview: string | null
}

export interface JobSnapshot {
  id: string
  operation: JobOperation
  title: string
  status: JobStatus
  progress: JobProgress | null
  createdAt: number
  finishedAt: number | null
  result: JobResultSummary | null
  error: { code: string; message: string } | null
}
