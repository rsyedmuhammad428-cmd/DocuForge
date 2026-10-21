import { readdir, unlink } from 'node:fs/promises'
import path from 'node:path'

/**
 * Removes the temporary files a job may have left behind, for example when the engine had to be
 * killed before it could clean up. The engine names them `.docuforge-<job id>-<n>.tmp`.
 * Returns how many files were removed.
 */
export async function removeStaleTempFiles(directory: string, jobId: string): Promise<number> {
  const prefix = `.docuforge-${jobId}-`
  let entries: string[]
  try {
    entries = await readdir(directory)
  } catch {
    return 0
  }

  let removed = 0
  for (const entry of entries) {
    if (entry.startsWith(prefix) && entry.endsWith('.tmp')) {
      try {
        await unlink(path.join(directory, entry))
        removed += 1
      } catch {
        // Already gone, or in use. Nothing more we can safely do.
      }
    }
  }
  return removed
}
