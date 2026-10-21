import type { PageThumbnail } from '../../../shared/files'

export interface ThumbnailLoaderOptions {
  fetchBatch: (pages: number[]) => Promise<PageThumbnail[]>
  /** Called whenever thumbnails arrive or the error state changes. */
  onChange: () => void
  /** Most thumbnails kept in memory. The oldest are dropped first and reloaded if needed again. */
  maxCached?: number
  batchSize?: number
  delayMs?: number
}

/**
 * Loads page previews on demand.
 *
 * Cards ask for their page when they scroll into view. Requests made close together are sent as
 * one batch, one batch is in flight at a time, and only a limited number of previews are kept,
 * so a huge PDF never means thousands of rendered pages in memory.
 */
export class ThumbnailLoader {
  error: string | null = null

  private readonly fetchBatch: ThumbnailLoaderOptions['fetchBatch']
  private readonly onChange: () => void
  private readonly maxCached: number
  private readonly batchSize: number
  private readonly delayMs: number
  private readonly cache = new Map<number, string>()
  private readonly pending = new Set<number>()
  private failedBatch: number[] = []
  private inFlight = false
  private failed = false
  private disposed = false
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(options: ThumbnailLoaderOptions) {
    this.fetchBatch = options.fetchBatch
    this.onChange = options.onChange
    this.maxCached = options.maxCached ?? 300
    this.batchSize = options.batchSize ?? 24
    this.delayMs = options.delayMs ?? 60
  }

  get(page: number): string | undefined {
    return this.cache.get(page)
  }

  request(page: number): void {
    if (this.disposed || this.failed || this.cache.has(page) || this.pending.has(page)) return
    this.pending.add(page)
    this.schedule()
  }

  /** Tries again after an error, including the pages that failed. */
  retry(): void {
    if (this.disposed) return
    this.failed = false
    this.error = null
    for (const page of this.failedBatch) this.pending.add(page)
    this.failedBatch = []
    this.onChange()
    this.schedule()
  }

  /**
   * Makes the loader active again. React runs an effect's cleanup and setup twice in development
   * (StrictMode) on the SAME object, so a loader that was disposed must be able to start again.
   */
  start(): void {
    this.disposed = false
  }

  dispose(): void {
    this.disposed = true
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.cache.clear()
    this.pending.clear()
  }

  private schedule(): void {
    if (this.timer !== undefined || this.inFlight || this.pending.size === 0) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.flush()
    }, this.delayMs)
  }

  private async flush(): Promise<void> {
    if (this.disposed || this.inFlight) return
    const batch = [...this.pending].sort((a, b) => a - b).slice(0, this.batchSize)
    if (batch.length === 0) return
    for (const page of batch) this.pending.delete(page)

    this.inFlight = true
    try {
      const thumbnails = await this.fetchBatch(batch)
      if (this.disposed) return
      for (const thumbnail of thumbnails) {
        this.cache.delete(thumbnail.page) // re-insert so it counts as the newest
        this.cache.set(thumbnail.page, thumbnail.dataUrl)
      }
      while (this.cache.size > this.maxCached) {
        const oldest = this.cache.keys().next().value
        if (oldest === undefined) break
        this.cache.delete(oldest)
      }
      this.onChange()
    } catch (error) {
      if (this.disposed) return
      this.failed = true
      this.failedBatch = batch
      this.error = error instanceof Error ? error.message : 'Page previews could not be loaded.'
      this.onChange()
    } finally {
      this.inFlight = false
      this.schedule()
    }
  }
}
