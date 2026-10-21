import { mkdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * Saves JSON so a crash can never leave a half-written file: the data goes to a temporary file
 * first, which then replaces the real one in a single step.
 */
export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.tmp`
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(tempPath, filePath)
}
