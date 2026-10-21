import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { FileRef, OutputRef } from '../../shared/files'

const MAX_INPUTS = 1000
const MAX_OUTPUTS = 200

export interface RegisteredOutput {
  kind: 'file' | 'folder'
  path: string
}

/**
 * Remembers which files and folders the USER chose in a native dialog.
 *
 * The page only ever sees opaque ids. A job can refer to a path only through an id issued here,
 * so a compromised or buggy page cannot make the app read or write an arbitrary location.
 */
export class FileRegistry {
  private readonly inputs = new Map<string, { path: string; ref: FileRef }>()
  private readonly outputs = new Map<string, RegisteredOutput>()

  addInput(filePath: string, sizeBytes: number): FileRef {
    if (this.inputs.size >= MAX_INPUTS) {
      throw new Error('Too many files are open. Remove some files and try again.')
    }
    const ref: FileRef = { id: randomUUID(), name: path.basename(filePath), sizeBytes }
    this.inputs.set(ref.id, { path: filePath, ref })
    return ref
  }

  getInput(id: string): { path: string; name: string } | undefined {
    const entry = this.inputs.get(id)
    return entry === undefined ? undefined : { path: entry.path, name: entry.ref.name }
  }

  release(ids: readonly string[]): void {
    for (const id of ids) this.inputs.delete(id)
  }

  addOutput(kind: RegisteredOutput['kind'], outputPath: string): OutputRef {
    const id = randomUUID()
    this.outputs.set(id, { kind, path: outputPath })
    // Outputs are used once, right after the dialog. Keep only the most recent ones.
    while (this.outputs.size > MAX_OUTPUTS) {
      const oldest = this.outputs.keys().next().value
      if (oldest === undefined) break
      this.outputs.delete(oldest)
    }
    return {
      id,
      name: path.basename(outputPath),
      location: kind === 'folder' ? outputPath : path.dirname(outputPath),
    }
  }

  getOutput(id: string): RegisteredOutput | undefined {
    return this.outputs.get(id)
  }
}
