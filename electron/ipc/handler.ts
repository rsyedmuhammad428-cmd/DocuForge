import { BrowserWindow, ipcMain } from 'electron'
import type { IpcErrorCode, IpcResult } from '../../shared/ipc'

/** Throw this from a handler for a normal failure whose message is safe to show the user. */
export class UserFacingError extends Error {
  readonly code: Extract<IpcErrorCode, 'INVALID_REQUEST' | 'OPERATION_FAILED'>

  constructor(code: UserFacingError['code'], message: string) {
    super(message)
    this.code = code
  }
}

export interface HandlerContext {
  /** The window that sent the request, used as the parent of native dialogs. */
  window: BrowserWindow | null
}

function failure(code: IpcErrorCode, message: string): IpcResult<never> {
  return { ok: false, error: { code, message } }
}

/**
 * Registers IPC channels with the checks every handler needs:
 * 1. the request must come from one of our own pages,
 * 2. the payload must pass validation,
 * 3. user-facing errors are passed on; anything unexpected is logged here and returned
 *    without internal details.
 */
export function createHandlerRegistrar(isTrustedUrl: (url: string) => boolean) {
  return function handle<TInput, TOutput>(
    channel: string,
    parseInput: (raw: unknown) => TInput,
    run: (input: TInput, context: HandlerContext) => TOutput | Promise<TOutput>,
  ): void {
    ipcMain.handle(channel, async (event, raw: unknown): Promise<IpcResult<TOutput>> => {
      const senderUrl = event.senderFrame?.url
      if (senderUrl === undefined || !isTrustedUrl(senderUrl)) {
        return failure('FORBIDDEN', 'The request was rejected.')
      }

      let input: TInput
      try {
        input = parseInput(raw)
      } catch {
        return failure('INVALID_REQUEST', 'The request was not valid.')
      }

      try {
        const window = BrowserWindow.fromWebContents(event.sender)
        return { ok: true, data: await run(input, { window }) }
      } catch (error) {
        if (error instanceof UserFacingError) return failure(error.code, error.message)
        console.error(`IPC handler failed: ${channel}`, error)
        return failure('INTERNAL', 'The operation failed unexpectedly.')
      }
    })
  }
}

export type HandleFn = ReturnType<typeof createHandlerRegistrar>

export const noInput = (): undefined => undefined
