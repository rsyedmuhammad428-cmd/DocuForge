import { readFileSync } from 'node:fs'
import path from 'node:path'
import { HistoryEntrySchema, type HistoryEntry } from '../../shared/history'
import { writeJsonAtomic } from './atomic-json'

export interface HistoryStoreOptions {
  /** Most entries kept. The oldest are dropped first. */
  limit?: number
  /** Read each time, so turning history off in Settings takes effect immediately. */
  isEnabled: () => boolean
}

const DEFAULT_LIMIT = 200

/**
 * A short list of finished jobs, saved as JSON in the user data folder.
 *
 * It holds file names and where results were saved. Never document contents. Invalid or damaged
 * entries are dropped on load, so a bad file can never stop the app from starting.
 */
export class HistoryStore {
  private readonly filePath: string
  private readonly limit: number
  private readonly isEnabled: () => boolean
  private entries: HistoryEntry[]
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(filePath: string, options: HistoryStoreOptions) {
    this.filePath = filePath
    this.limit = options.limit ?? DEFAULT_LIMIT
    this.isEnabled = options.isEnabled
    this.entries = this.loadSync()
  }

  /** Newest first. */
  list(): readonly HistoryEntry[] {
    return this.entries
  }

  get(id: string): HistoryEntry | undefined {
    return this.entries.find((entry) => entry.id === id)
  }

  /** Adds an entry unless history is turned off. Never throws: history must not break a job. */
  record(entry: HistoryEntry): void {
    if (!this.isEnabled()) return
    this.entries = [entry, ...this.entries.filter((existing) => existing.id !== entry.id)].slice(0, this.limit)
    const snapshot = this.entries
    this.writeQueue = this.writeQueue
      .then(() => writeJsonAtomic(this.filePath, { version: 1, entries: snapshot }))
      .catch((error: unknown) => console.error('History could not be saved.', error))
  }

  /** Resolves when every pending write has reached the disk. Call it before the app quits. */
  flush(): Promise<void> {
    return this.writeQueue
  }

  async clear(): Promise<void> {
    this.entries = []
    const write = this.writeQueue.then(() => writeJsonAtomic(this.filePath, { version: 1, entries: [] }))
    this.writeQueue = write.catch(() => undefined)
    await write
  }

  /** Folders that results were saved to, most recent first. Used to look for leftover temp files. */
  outputDirectories(max = 20): string[] {
    const folders = new Set<string>()
    for (const entry of this.entries) {
      const folder = entry.outputLocation ?? (entry.outputPath === null ? null : path.dirname(entry.outputPath))
      if (folder !== null) folders.add(folder)
      if (folders.size >= max) break
    }
    return [...folders]
  }

  private loadSync(): HistoryEntry[] {
    try {
      const raw: unknown = JSON.parse(readFileSync(this.filePath, 'utf8'))
      const list = typeof raw === 'object' && raw !== null && 'entries' in raw ? raw.entries : []
      if (!Array.isArray(list)) return []
      const valid: HistoryEntry[] = []
      for (const item of list) {
        const parsed = HistoryEntrySchema.safeParse(item)
        if (parsed.success) valid.push(parsed.data)
      }
      return valid.slice(0, this.limit)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('The history file could not be read. Starting with an empty history.')
      }
      return []
    }
  }
}
