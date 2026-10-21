import { app, dialog, type OpenDialogOptions } from 'electron'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { FILE_KINDS, OUTPUT_KINDS, type FileRef } from '../../shared/files'
import { IPC_CHANNELS } from '../../shared/ipc'
import type { Settings } from '../../shared/settings'
import type { FileRegistry } from '../services/file-registry'
import type { SettingsStore } from '../services/settings-store'
import type { HandleFn, HandlerContext } from './handler'
import { noInput, UserFacingError } from './handler'

interface FileHandlerDependencies {
  registry: FileRegistry
  settings: SettingsStore
}

async function showOpenDialog(context: HandlerContext, options: OpenDialogOptions) {
  return context.window === null
    ? dialog.showOpenDialog(options)
    : dialog.showOpenDialog(context.window, options)
}

function startFolder(settings: SettingsStore): string {
  return settings.get().defaultOutputFolder ?? app.getPath('documents')
}

/** Everything that opens a native dialog. Paths stay here; the page only gets opaque ids. */
export function registerFileHandlers(handle: HandleFn, deps: FileHandlerDependencies): void {
  const { registry, settings } = deps

  handle(
    IPC_CHANNELS.filesSelect,
    (raw) => z.object({ kind: z.enum(['pdf', 'image', 'text', 'document']), multiple: z.boolean() }).parse(raw),
    async ({ kind, multiple }, context): Promise<FileRef[]> => {
      const allowed = FILE_KINDS[kind]
      const extensions: readonly string[] = allowed.extensions
      const result = await showOpenDialog(context, {
        title: multiple ? `Add ${allowed.label.toLowerCase()}` : `Choose a file (${allowed.label.toLowerCase()})`,
        properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'],
        filters: [{ name: allowed.label, extensions: [...allowed.extensions] }],
      })
      if (result.canceled) return []

      const refs: FileRef[] = []
      for (const filePath of result.filePaths) {
        // The dialog filter can be bypassed with "All files", so check the extension again.
        if (!extensions.includes(path.extname(filePath).slice(1).toLowerCase())) continue
        try {
          const info = await stat(filePath)
          if (info.isFile()) refs.push(registry.addInput(filePath, info.size))
        } catch {
          // The file vanished between the dialog and now. Skip it.
        }
      }
      return refs
    },
  )

  handle(
    IPC_CHANNELS.filesRelease,
    (raw) => z.array(z.string()).max(1000).parse(raw),
    (ids) => {
      registry.release(ids)
      return null
    },
  )

  handle(
    IPC_CHANNELS.outputSelectFile,
    (raw) =>
      z.object({ suggestedName: z.string().min(1).max(200), kind: z.enum(['pdf', 'text', 'word']) }).parse(raw),
    async ({ suggestedName, kind }, context) => {
      const { label, extension } = OUTPUT_KINDS[kind]
      const options = {
        title: 'Save as',
        defaultPath: path.join(startFolder(settings), path.basename(suggestedName)),
        filters: [{ name: label, extensions: [extension] }],
      }
      // The save dialog asks the user before replacing an existing file.
      const result =
        context.window === null
          ? await dialog.showSaveDialog(options)
          : await dialog.showSaveDialog(context.window, options)
      if (result.canceled || result.filePath === '') return null

      const filePath =
        path.extname(result.filePath).toLowerCase() === `.${extension}`
          ? result.filePath
          : `${result.filePath}.${extension}`
      return registry.addOutput('file', filePath)
    },
  )

  handle(IPC_CHANNELS.outputSelectFolder, noInput, async (_input, context) => {
    const result = await showOpenDialog(context, {
      title: 'Choose an output folder',
      defaultPath: startFolder(settings),
      properties: ['openDirectory', 'createDirectory'],
    })
    const folder = result.filePaths[0]
    if (result.canceled || folder === undefined) return null
    return registry.addOutput('folder', folder)
  })

  handle(
    IPC_CHANNELS.settingsChooseOutputFolder,
    noInput,
    async (_input, context): Promise<Settings> => {
      const result = await showOpenDialog(context, {
        title: 'Choose the default output folder',
        defaultPath: startFolder(settings),
        properties: ['openDirectory', 'createDirectory'],
      })
      const folder = result.filePaths[0]
      if (result.canceled || folder === undefined) return settings.get()
      try {
        return await settings.update({ defaultOutputFolder: folder })
      } catch {
        throw new UserFacingError('OPERATION_FAILED', 'The folder could not be saved.')
      }
    },
  )
}
