import { spawn } from 'node:child_process'
import {
  EngineMessageSchema,
  type EngineOutcome,
  type EngineRequest,
} from '../../shared/engine-protocol'
import type { EngineCommand } from './engine-locator'
import { createLineSplitter } from './line-splitter'

export interface EngineProgress {
  current: number
  total: number | null
}

export interface EngineProcess {
  /** Asks the engine to stop. If it does not exit in time, it is killed. */
  cancel(): void
  /** Always resolves, never rejects. The outcome says whether the engine succeeded or why not. */
  outcome: Promise<EngineOutcome>
}

export type EngineLauncher = (
  request: EngineRequest,
  onProgress: (progress: EngineProgress) => void,
) => EngineProcess

export interface LauncherOptions {
  resolveCommand: () => EngineCommand
  /** How long the engine gets to stop by itself after a cancel request. */
  killGraceMs?: number
}

const STDERR_LIMIT = 4000

/**
 * When the engine dies without answering, its last words on stderr usually say why.
 * This turns them into a short message the user can act on (or send to the developer).
 */
export function describeCrash(stderr: string): { code: string; message: string } {
  const missing = /ModuleNotFoundError: No module named '([\w.]+)'/.exec(stderr)
  if (missing?.[1] !== undefined) {
    return {
      code: 'ENGINE_PACKAGES_MISSING',
      message: `A Python package the engine needs is missing ('${missing[1]}'). Close DocuForge, run "npm run engine:setup", then start it again.`,
    }
  }
  const lastError = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .reverse()
    .find((line) => /^[\w.]*(Error|Exception)\b/.test(line))
  return {
    code: 'ENGINE_CRASHED',
    message:
      lastError === undefined
        ? 'The PDF engine stopped unexpectedly.'
        : `The PDF engine stopped unexpectedly. (${lastError.slice(0, 200)})`,
  }
}

/**
 * Starts one engine process per request.
 *
 * Protocol: one JSON request line on stdin; one JSON message per line on stdout (see
 * python-engine/docuforge_engine/protocol.py). stdin stays OPEN until the engine exits, because the
 * engine treats a closed stdin as "the app went away" and cancels the job.
 */
export function createEngineLauncher(options: LauncherOptions): EngineLauncher {
  const killGraceMs = options.killGraceMs ?? 5000

  return (request, onProgress) => {
    const command = options.resolveCommand()
    let finalMessage: EngineOutcome | null = null
    let settled = false
    let cancelRequested = false
    let killTimer: NodeJS.Timeout | undefined
    let stderrTail = ''

    let resolveOutcome: (outcome: EngineOutcome) => void = () => undefined
    const outcome = new Promise<EngineOutcome>((resolve) => {
      resolveOutcome = resolve
    })
    const settle = (value: EngineOutcome): void => {
      if (settled) return
      settled = true
      if (killTimer !== undefined) clearTimeout(killTimer)
      resolveOutcome(value)
    }

    const child = spawn(command.command, command.args, {
      cwd: command.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
    })

    const handleLine = (line: string): void => {
      let parsed: unknown
      try {
        parsed = JSON.parse(line)
      } catch {
        return // Not protocol output. Ignore it.
      }
      const message = EngineMessageSchema.safeParse(parsed)
      if (!message.success) return

      switch (message.data.type) {
        case 'progress':
          onProgress({ current: message.data.current, total: message.data.total })
          break
        case 'result':
          finalMessage ??= { kind: 'result', data: message.data.data }
          break
        case 'error':
          finalMessage ??= {
            kind: 'error',
            code: message.data.code,
            message: message.data.message,
          }
          break
      }
    }

    const splitter = createLineSplitter(handleLine, () => {
      finalMessage ??= {
        kind: 'error',
        code: 'ENGINE_BAD_RESPONSE',
        message: 'The PDF engine sent an unreadable response.',
      }
    })

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => splitter.push(chunk))
    child.stdout.on('end', () => splitter.flush())
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      stderrTail = (stderrTail + chunk).slice(-STDERR_LIMIT)
    })
    child.stdin.on('error', () => undefined) // The engine may exit before we finish writing.

    child.on('error', () => {
      settle({ kind: 'error', code: 'ENGINE_UNAVAILABLE', message: command.unavailableMessage })
    })

    child.on('close', (exitCode) => {
      splitter.flush()
      if (finalMessage === null) {
        if (stderrTail !== '') console.error(`PDF engine exited with code ${exitCode}:\n${stderrTail}`)
        finalMessage = cancelRequested
          ? { kind: 'error', code: 'CANCELLED', message: 'The job was cancelled.' }
          : { kind: 'error', ...describeCrash(stderrTail) }
      } else if (finalMessage.kind === 'error' && finalMessage.code === 'INTERNAL' && stderrTail !== '') {
        // The engine reported an unexpected error. Its traceback is only useful to the developer.
        console.error(`PDF engine reported an unexpected error:\n${stderrTail}`)
      }
      settle(finalMessage)
    })

    child.stdin.write(`${JSON.stringify(request)}\n`)

    return {
      outcome,
      cancel(): void {
        if (settled || cancelRequested) return
        cancelRequested = true
        child.stdin.write('{"type":"cancel"}\n')
        killTimer = setTimeout(() => child.kill(), killGraceMs)
      },
    }
  }
}
