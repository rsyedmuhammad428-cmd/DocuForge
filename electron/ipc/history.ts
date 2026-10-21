import { shell } from 'electron'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { HistoryEntry, HistoryEntryView } from '../../shared/history'
import { IPC_CHANNELS } from '../../shared/ipc'
import type { HistoryStore } from '../services/history-store'
import { noInput, UserFacingError, type HandleFn } from './handler'

const entryIdSchema = z.string().min(1).max(100)

async function exists(target: string | null): Promise<boolean> {
  if (target === null) return false
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

export function registerHistoryHandlers(handle: HandleFn, history: HistoryStore): void {
  // A history entry is a reference to a result. The file may have been moved or deleted since,
  // so it is checked every time before the user is pointed at it.
  const requireResult = async (entryId: string): Promise<HistoryEntry & { outputPath: string }> => {
    const entry = history.get(entryId)
    if (entry === undefined || entry.outputPath === null || !(await exists(entry.outputPath))) {
      throw new UserFacingError('OPERATION_FAILED', 'The file is no longer there. It may have been moved or deleted.')
    }
    return { ...entry, outputPath: entry.outputPath }
  }

  handle(IPC_CHANNELS.historyList, noInput, async (): Promise<HistoryEntryView[]> =>
    Promise.all(
      history.list().map(async ({ outputPath, ...entry }) => ({
        ...entry,
        available: entry.status === 'succeeded' && (await exists(outputPath)),
      })),
    ),
  )

  handle(IPC_CHANNELS.historyClear, noInput, async () => {
    try {
      await history.clear()
    } catch {
      throw new UserFacingError('OPERATION_FAILED', 'The history could not be cleared.')
    }
    return null
  })

  handle(IPC_CHANNELS.historyReveal, (raw) => entryIdSchema.parse(raw), async (entryId) => {
    shell.showItemInFolder((await requireResult(entryId)).outputPath)
    return null
  })

  handle(IPC_CHANNELS.historyOpen, (raw) => entryIdSchema.parse(raw), async (entryId) => {
    const entry = await requireResult(entryId)
    // One result: open the file. Several results (for example a split): open their folder.
    const error = await shell.openPath(entry.outputCount === 1 ? entry.outputPath : path.dirname(entry.outputPath))
    if (error !== '') throw new UserFacingError('OPERATION_FAILED', 'The result could not be opened.')
    return null
  })
}
