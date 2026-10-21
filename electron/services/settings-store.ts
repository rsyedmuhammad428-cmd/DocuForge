import { readFileSync } from 'node:fs'
import {
  DEFAULT_SETTINGS,
  parseSettings,
  type Settings,
} from '../../shared/settings'
import { writeJsonAtomic } from './atomic-json'

/**
 * Persists settings as a small JSON file.
 *
 * Reading happens once, synchronously, at startup so the window can be created
 * with the correct theme. Writes are queued so concurrent updates cannot
 * interleave, and each write goes to a temporary file first so a crash cannot
 * leave a half-written settings file.
 */
export class SettingsStore {
  private readonly filePath: string
  private current: Settings
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(filePath: string) {
    this.filePath = filePath
    this.current = this.loadSync()
  }

  get(): Settings {
    return this.current
  }

  async update(patch: Partial<Settings>): Promise<Settings> {
    const previous = this.current
    const definedPatch = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    )
    const next = parseSettings({ ...previous, ...definedPatch })
    this.current = next

    const write = this.writeQueue.then(() => this.persist(next))
    this.writeQueue = write.catch(() => undefined)

    try {
      await write
    } catch (error) {
      if (this.current === next) {
        this.current = previous
      }
      throw error
    }
    return next
  }

  private loadSync(): Settings {
    try {
      const text = readFileSync(this.filePath, 'utf8')
      return parseSettings(JSON.parse(text))
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') {
        console.warn('Settings file could not be read. Using defaults.')
      }
      return { ...DEFAULT_SETTINGS }
    }
  }

  private async persist(settings: Settings): Promise<void> {
    await writeJsonAtomic(this.filePath, settings)
  }
}
