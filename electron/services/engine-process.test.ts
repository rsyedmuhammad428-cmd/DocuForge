import { describe, expect, it } from 'vitest'
import type { EngineRequest } from '../../shared/engine-protocol'
import type { EngineCommand } from './engine-locator'
import { createEngineLauncher, describeCrash, type EngineProgress } from './engine-process'

/** Uses Node itself as a stand-in engine, so these tests exercise real processes and pipes. */
function fakeEngine(script: string): EngineCommand {
  return {
    command: process.execPath,
    args: ['-e', script],
    cwd: undefined,
    unavailableMessage: 'engine missing',
  }
}

const request: EngineRequest = { id: 'job-1', op: 'merge', args: {} }

function launch(script: string, killGraceMs = 5000) {
  const progress: EngineProgress[] = []
  const launcher = createEngineLauncher({ resolveCommand: () => fakeEngine(script), killGraceMs })
  const proc = launcher(request, (p) => progress.push(p))
  return { proc, progress }
}

const READ_REQUEST = `
const readline = require('node:readline');
const rl = readline.createInterface({ input: process.stdin });
const send = (m) => process.stdout.write(JSON.stringify(m) + '\\n');
`

describe('createEngineLauncher', () => {
  it('delivers progress and the final result', async () => {
    const { proc, progress } = launch(`${READ_REQUEST}
      rl.once('line', (line) => {
        const req = JSON.parse(line);
        send({ type: 'progress', current: 1, total: 2 });
        send({ type: 'progress', current: 2, total: 2 });
        send({ type: 'result', data: { echoedId: req.id } });
        process.exit(0);
      });`)

    expect(await proc.outcome).toEqual({ kind: 'result', data: { echoedId: 'job-1' } })
    expect(progress).toEqual([
      { current: 1, total: 2 },
      { current: 2, total: 2 },
    ])
  })

  it('reports an error message from the engine', async () => {
    const { proc } = launch(`${READ_REQUEST}
      rl.once('line', () => { send({ type: 'error', code: 'PDF_CORRUPT', message: 'Damaged.' }); process.exit(1); });`)
    expect(await proc.outcome).toEqual({ kind: 'error', code: 'PDF_CORRUPT', message: 'Damaged.' })
  })

  it('ignores noise and malformed messages on stdout', async () => {
    const { proc } = launch(`${READ_REQUEST}
      rl.once('line', () => {
        process.stdout.write('hello there\\n{"type":"unknown"}\\n{"type":"progress","current":"x"}\\n');
        send({ type: 'result', data: { ok: true } });
        process.exit(0);
      });`)
    expect(await proc.outcome).toEqual({ kind: 'result', data: { ok: true } })
  })

  it('reports a crash when the engine exits without a final message', async () => {
    const { proc } = launch('process.exit(3)')
    expect(await proc.outcome).toMatchObject({ kind: 'error', code: 'ENGINE_CRASHED' })
  })

  it('reports an unavailable engine with the locator message', async () => {
    const launcher = createEngineLauncher({
      resolveCommand: () => ({
        command: 'definitely-not-a-real-program-docuforge',
        args: [],
        cwd: undefined,
        unavailableMessage: 'engine missing',
      }),
    })
    expect(await launcher(request, () => undefined).outcome).toEqual({
      kind: 'error',
      code: 'ENGINE_UNAVAILABLE',
      message: 'engine missing',
    })
  })

  it('lets the engine stop itself when cancelled', async () => {
    const { proc } = launch(`${READ_REQUEST}
      let sawRequest = false;
      rl.on('line', (line) => {
        if (!sawRequest) { sawRequest = true; return; }
        if (JSON.parse(line).type === 'cancel') {
          send({ type: 'error', code: 'CANCELLED', message: 'The job was cancelled.' });
          process.exit(1);
        }
      });`)
    setTimeout(() => proc.cancel(), 100)
    expect(await proc.outcome).toMatchObject({ kind: 'error', code: 'CANCELLED' })
  })

  it('kills an engine that ignores the cancel request', async () => {
    const { proc } = launch('setInterval(() => {}, 1000)', 150)
    setTimeout(() => proc.cancel(), 50)
    expect(await proc.outcome).toMatchObject({ kind: 'error', code: 'CANCELLED' })
  })

  it('treats a finished job as finished even if cancel arrives late', async () => {
    const { proc } = launch(`${READ_REQUEST}
      rl.once('line', () => { send({ type: 'result', data: { done: true } }); process.exit(0); });`)
    const outcome = await proc.outcome
    proc.cancel()
    expect(outcome).toEqual({ kind: 'result', data: { done: true } })
  })

  it('says which Python package is missing when the engine cannot start', async () => {
    const { proc } = launch(`
      process.stderr.write("Traceback (most recent call last):\\n  File \\"x.py\\", line 1\\nModuleNotFoundError: No module named 'mammoth'\\n");
      process.exit(1);`)
    const outcome = await proc.outcome
    expect(outcome).toMatchObject({ kind: 'error', code: 'ENGINE_PACKAGES_MISSING' })
    expect(outcome.kind === 'error' && outcome.message).toContain("'mammoth'")
    expect(outcome.kind === 'error' && outcome.message).toContain('npm run engine:setup')
  })

  it('shows the last error line when the engine crashes for another reason', async () => {
    const { proc } = launch(`
      process.stderr.write("Traceback (most recent call last):\\nImportError: DLL load failed while importing cv2\\n");
      process.exit(1);`)
    const outcome = await proc.outcome
    expect(outcome).toMatchObject({ kind: 'error', code: 'ENGINE_CRASHED' })
    expect(outcome.kind === 'error' && outcome.message).toBe(
      'The PDF engine stopped unexpectedly. (ImportError: DLL load failed while importing cv2)',
    )
  })
})

describe('describeCrash', () => {
  it('handles empty and unrelated output', () => {
    expect(describeCrash('')).toEqual({ code: 'ENGINE_CRASHED', message: 'The PDF engine stopped unexpectedly.' })
    expect(describeCrash('some log line\nanother line').message).toBe('The PDF engine stopped unexpectedly.')
  })

  it('finds the exception line even with Windows line endings and trailing text', () => {
    const text = 'Traceback...\r\n  File "a.py"\r\nOSError: [WinError 126] The specified module could not be found\r\n'
    expect(describeCrash(text).message).toContain('OSError: [WinError 126]')
  })

  it('keeps very long error lines short', () => {
    const long = `RuntimeError: ${'x'.repeat(500)}`
    expect(describeCrash(long).message.length).toBeLessThan(260)
  })

  it('passes extra environment variables to the engine', async () => {
    const launcher = createEngineLauncher({
      resolveCommand: () => fakeEngine(`${READ_REQUEST}
        rl.once('line', () => { send({ type: 'result', data: { tools: process.env.DOCUFORGE_TOOLS_DIR } }); process.exit(0); });`),
      env: { DOCUFORGE_TOOLS_DIR: 'C:\\App\\resources\\tools' },
    })
    expect(await launcher(request, () => undefined).outcome).toEqual({
      kind: 'result',
      data: { tools: 'C:\\App\\resources\\tools' },
    })
  })
})
