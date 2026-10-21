import { z } from 'zod'
import type { InspectResult, PageThumbnail } from '../../shared/files'
import { IPC_CHANNELS, type ToolsStatus } from '../../shared/ipc'
import { PdfQueryService, QueryError } from '../services/pdf-service'
import { noInput, UserFacingError, type HandleFn } from './handler'

async function userFacing<T>(work: Promise<T>): Promise<T> {
  try {
    return await work
  } catch (error) {
    if (error instanceof QueryError) {
      throw new UserFacingError(
        error.code === 'INVALID_REQUEST' ? 'INVALID_REQUEST' : 'OPERATION_FAILED',
        error.message,
      )
    }
    throw error
  }
}

export function registerPdfHandlers(handle: HandleFn, pdf: PdfQueryService): void {
  handle(
    IPC_CHANNELS.pdfInspect,
    (raw) => z.array(z.string().min(1)).max(200).parse(raw),
    (fileIds): Promise<InspectResult[]> => userFacing(pdf.inspect(fileIds)),
  )

  handle(
    IPC_CHANNELS.pdfThumbnails,
    (raw) =>
      z
        .object({
          fileId: z.string().min(1),
          pages: z.array(z.number().int().min(0)).min(1).max(60),
          width: z.number().int().min(80).max(400).optional(),
        })
        .parse(raw),
    ({ fileId, pages, width }): Promise<PageThumbnail[]> =>
      userFacing(pdf.thumbnails(fileId, pages, width ?? 160)),
  )

  handle(
    IPC_CHANNELS.toolsStatus,
    noInput,
    (): Promise<ToolsStatus> => userFacing(pdf.toolsStatus()),
  )
}
