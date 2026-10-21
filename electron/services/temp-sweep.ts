import { readdir, rm, stat, unlink } from 'node:fs/promises'
import path from 'node:path'

const TEMP_FILE = /^\.docuforge-[A-Za-z0-9_-]+-\d+\.tmp$/
const TEMP_FOLDER = /^docuforge-(lo|ocr)-/

export interface SweepOptions {
  /** Output folders to look in for `.docuforge-*.tmp` files. */
  directories: readonly string[]
  /** The system temporary folder, where the engine keeps its private work folders. */
  systemTempDirectory: string
  /** Only things older than this are removed, so a job that is running now is never touched. */
  maxAgeMs: number
  now?: number
}

/**
 * Removes temporary files and folders that earlier runs left behind, for example after a crash.
 * Only names the engine itself creates are matched, and only if they are old enough.
 */
export async function sweepStaleTempFiles(options: SweepOptions): Promise<{ files: number; folders: number }> {
  const now = options.now ?? Date.now()
  const isOld = async (target: string): Promise<boolean> => {
    try {
      return now - (await stat(target)).mtimeMs > options.maxAgeMs
    } catch {
      return false
    }
  }

  let files = 0
  for (const directory of new Set(options.directories)) {
    let names: string[]
    try {
      names = await readdir(directory)
    } catch {
      continue
    }
    for (const name of names) {
      const target = path.join(directory, name)
      if (TEMP_FILE.test(name) && (await isOld(target))) {
        try {
          await unlink(target)
          files += 1
        } catch {
          // In use or already gone.
        }
      }
    }
  }

  let folders = 0
  try {
    for (const name of await readdir(options.systemTempDirectory)) {
      const target = path.join(options.systemTempDirectory, name)
      if (TEMP_FOLDER.test(name) && (await isOld(target))) {
        await rm(target, { recursive: true, force: true })
        folders += 1
      }
    }
  } catch {
    // The system temp folder could not be read. Nothing to do.
  }
  return { files, folders }
}
