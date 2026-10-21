import { randomUUID } from 'node:crypto'
import {
  InspectDataSchema,
  ToolsStatusDataSchema,
  ThumbnailsDataSchema,
  type EngineOperation,
} from '../../shared/engine-protocol'
import type { InspectResult, PageThumbnail } from '../../shared/files'
import type { ToolsStatus } from '../../shared/ipc'
import type { EngineLauncher } from './engine-process'
import type { FileRegistry } from './file-registry'
import { createLimiter } from './limiter'

/** A failure with a message that is safe to show to the user. */
export class QueryError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

/**
 * Quick read-only questions about a PDF: how many pages it has, and what a page looks like.
 * These run outside the job queue so they never wait behind a long merge or split.
 */
export class PdfQueryService {
  private readonly registry: FileRegistry
  private readonly launcher: EngineLauncher
  private readonly limit = createLimiter(2)

  constructor(registry: FileRegistry, launcher: EngineLauncher) {
    this.registry = registry
    this.launcher = launcher
  }

  async inspect(fileIds: readonly string[]): Promise<InspectResult[]> {
    const files = fileIds.map((id) => ({ id, input: this.registry.getInput(id) }))
    const known = files.flatMap((file) => (file.input === undefined ? [] : [{ id: file.id, ...file.input }]))
    if (known.length === 0) return []

    const data = InspectDataSchema.parse(
      await this.run('inspect', { paths: known.map((file) => file.path) }),
    )

    return known.map((file, index): InspectResult => {
      const entry = data.files[index]
      if (entry === undefined) {
        return { fileId: file.id, ok: false, pageCount: null, error: { code: 'INTERNAL', message: 'The file could not be checked.' } }
      }
      return {
        fileId: file.id,
        ok: entry.ok,
        pageCount: entry.pageCount ?? null,
        error: entry.error ?? null,
      }
    })
  }

  async thumbnails(fileId: string, pages: number[], width: number): Promise<PageThumbnail[]> {
    const input = this.registry.getInput(fileId)
    if (input === undefined) {
      throw new QueryError('INVALID_REQUEST', 'The file is no longer available. Add it again.')
    }
    const data = ThumbnailsDataSchema.parse(
      await this.run('thumbnails', { input: input.path, pages, width }),
    )
    return data.thumbnails
  }

  async toolsStatus(): Promise<ToolsStatus> {
    return ToolsStatusDataSchema.parse(await this.run('tools_status', {}))
  }

  private run(op: EngineOperation, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.limit(async () => {
      const process = this.launcher({ id: randomUUID(), op, args }, () => undefined)
      const outcome = await process.outcome
      if (outcome.kind === 'error') throw new QueryError(outcome.code, outcome.message)
      return outcome.data
    })
  }
}
