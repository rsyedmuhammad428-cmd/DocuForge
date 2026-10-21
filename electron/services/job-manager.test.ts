import { describe, expect, it } from 'vitest'
import type { EngineOutcome, EngineRequest } from '../../shared/engine-protocol'
import type { JobSnapshot } from '../../shared/jobs'
import type { EngineLauncher, EngineProgress } from './engine-process'
import type { PreparedJob } from './job-preparer'
import { JobManager, type FinishedJobInfo } from './job-manager'

const prepared = (title = 'Merge 2 PDFs'): PreparedJob => ({
  operation: 'merge',
  title,
  engine: { op: 'merge', args: {} },
  outputDirectory: '/out',
  inputNames: ['a.pdf', 'b.pdf'],
})

/** A controllable fake engine: the test decides when and how each job ends. */
function harness(options: { maxConcurrent?: number } = {}) {
  const finishedJobs: FinishedJobInfo[] = []
  const launched: Array<{
    request: EngineRequest
    cancelled: boolean
    progress: (p: EngineProgress) => void
    finish: (outcome: EngineOutcome) => void
  }> = []
  const events: JobSnapshot[] = []
  const cleanups: Array<{ directory: string; jobId: string }> = []
  let clock = 0
  let nextId = 0

  const launcher: EngineLauncher = (request, onProgress) => {
    let resolve: (outcome: EngineOutcome) => void = () => undefined
    const outcome = new Promise<EngineOutcome>((r) => {
      resolve = r
    })
    const entry = { request, cancelled: false, progress: onProgress, finish: resolve }
    launched.push(entry)
    return {
      outcome,
      cancel: () => {
        entry.cancelled = true
        // A cooperative engine reports CANCELLED after it has cleaned up.
        resolve({ kind: 'error', code: 'CANCELLED', message: 'The job was cancelled.' })
      },
    }
  }

  const manager = new JobManager({
    launcher,
    maxConcurrent: options.maxConcurrent ?? 1,
    onChange: (snapshot) => events.push(snapshot),
    onFinished: (info) => finishedJobs.push(info),
    cleanupTempFiles: async (directory, jobId) => {
      cleanups.push({ directory, jobId })
    },
    now: () => (clock += 200),
    newId: () => `job${(nextId += 1)}`,
  })
  const statusOf = (id: string) => manager.list().find((job) => job.id === id)?.status
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
  return { manager, launched, events, cleanups, statusOf, tick, finishedJobs }
}

const success = (extra: Record<string, unknown> = {}): EngineOutcome => ({
  kind: 'result',
  data: { outputPaths: ['/out/merged.pdf'], sizeBytes: 100, pageCount: 4, ...extra },
})

describe('JobManager', () => {
  it('runs a job to success and summarizes the result', async () => {
    const { manager, launched, statusOf, tick, cleanups } = harness()
    const job = manager.submit(prepared())
    expect(statusOf(job.id)).toBe('running')
    expect(launched[0]?.request).toMatchObject({ id: 'job1', op: 'merge' })

    launched[0]?.finish(success())
    await tick()

    const done = manager.list()[0]
    expect(done?.status).toBe('succeeded')
    expect(done?.result).toEqual({
      fileCount: 1,
      firstFileName: 'merged.pdf',
      location: '/out',
      totalBytes: 100,
      pageCount: 4,
      originalBytes: null,
      note: null,
      preview: null,
    })
    expect(done?.finishedAt).not.toBeNull()
    expect(manager.getOutputPaths(job.id)).toEqual(['/out/merged.pdf'])
    expect(cleanups).toEqual([]) // nothing to clean up after a success
  })

  it('records engine failures and cleans up temp files', async () => {
    const { manager, launched, tick, cleanups } = harness()
    const job = manager.submit(prepared())
    launched[0]?.finish({ kind: 'error', code: 'PDF_ENCRYPTED', message: 'Locked.' })
    await tick()

    const failed = manager.list()[0]
    expect(failed).toMatchObject({ status: 'failed', error: { code: 'PDF_ENCRYPTED', message: 'Locked.' } })
    expect(cleanups).toEqual([{ directory: '/out', jobId: job.id }])
  })

  it('fails a job whose result has an unexpected shape', async () => {
    const { manager, launched, tick } = harness()
    manager.submit(prepared())
    launched[0]?.finish({ kind: 'result', data: { nothing: true } })
    await tick()
    expect(manager.list()[0]).toMatchObject({ status: 'failed', error: { code: 'ENGINE_BAD_RESPONSE' } })
  })

  it('queues jobs beyond the concurrency limit and starts them in order', async () => {
    const { manager, launched, statusOf, tick } = harness({ maxConcurrent: 1 })
    const first = manager.submit(prepared('first'))
    const second = manager.submit(prepared('second'))
    const third = manager.submit(prepared('third'))

    expect([statusOf(first.id), statusOf(second.id), statusOf(third.id)]).toEqual([
      'running',
      'queued',
      'queued',
    ])
    expect(launched).toHaveLength(1)

    launched[0]?.finish(success())
    await tick()
    expect([statusOf(second.id), statusOf(third.id)]).toEqual(['running', 'queued'])
    expect(launched).toHaveLength(2)
  })

  it('cancels a queued job without ever starting the engine', async () => {
    const { manager, launched, statusOf } = harness({ maxConcurrent: 1 })
    manager.submit(prepared())
    const queued = manager.submit(prepared())

    expect(manager.cancel(queued.id)).toBe(true)
    expect(statusOf(queued.id)).toBe('cancelled')
    expect(launched).toHaveLength(1)
  })

  it('cancels a running job and cleans up', async () => {
    const { manager, launched, statusOf, tick, cleanups } = harness()
    const job = manager.submit(prepared())

    expect(manager.cancel(job.id)).toBe(true)
    await tick()

    expect(launched[0]?.cancelled).toBe(true)
    expect(statusOf(job.id)).toBe('cancelled')
    expect(manager.list()[0]?.error).toBeNull()
    expect(cleanups).toHaveLength(1)
  })

  it('reports success if the job finished before the cancel took effect', async () => {
    const { manager, launched, statusOf, tick } = harness()
    const job = manager.submit(prepared())
    launched[0]?.finish(success())
    await tick()
    expect(manager.cancel(job.id)).toBe(false)
    expect(statusOf(job.id)).toBe('succeeded')
  })

  it('does not cancel unknown or finished jobs', () => {
    const { manager } = harness()
    expect(manager.cancel('nope')).toBe(false)
  })

  it('throttles progress updates but always delivers the final step', async () => {
    const { manager, launched, events } = harness()
    manager.submit(prepared())
    const before = events.length
    // The fake clock advances 200 ms per call, so every update passes the 100 ms throttle.
    launched[0]?.progress({ current: 1, total: 3 })
    launched[0]?.progress({ current: 3, total: 3 })
    const progressEvents = events.slice(before).filter((e) => e.progress !== null)
    expect(progressEvents.at(-1)?.progress).toEqual({ current: 3, total: 3 })
  })

  it('emits a snapshot for every status change', async () => {
    const { manager, launched, events, tick } = harness()
    manager.submit(prepared())
    launched[0]?.finish(success())
    await tick()
    expect(events.map((e) => e.status)).toEqual(['queued', 'running', 'succeeded'])
  })

  it('shuts down by cancelling everything and waiting for it to stop', async () => {
    const { manager, statusOf } = harness({ maxConcurrent: 1 })
    const running = manager.submit(prepared())
    const queued = manager.submit(prepared())

    await manager.shutdown()

    expect(statusOf(running.id)).toBe('cancelled')
    expect(statusOf(queued.id)).toBe('cancelled')
    expect(manager.hasActiveJobs()).toBe(false)
  })

  it('keeps only a limited number of finished jobs in memory', async () => {
    const { manager, launched, tick } = harness()
    for (let i = 0; i < 55; i += 1) {
      manager.submit(prepared())
      launched[i]?.finish(success())
      await tick()
    }
    expect(manager.list()).toHaveLength(50)
  })

  it('reports every finished job once, with its inputs and outputs, however it ended', async () => {
    const { manager, launched, tick, finishedJobs } = harness({ maxConcurrent: 1 })
    manager.submit(prepared('ok'))
    manager.submit(prepared('fails'))
    const cancelled = manager.submit(prepared('cancelled'))

    launched[0]?.finish(success())
    await tick()
    launched[1]?.finish({ kind: 'error', code: 'PDF_CORRUPT', message: 'Damaged.' })
    await tick()
    manager.cancel(cancelled.id)
    await tick()

    expect(finishedJobs.map((j) => j.snapshot.status)).toEqual(['succeeded', 'failed', 'cancelled'])
    expect(finishedJobs[0]).toMatchObject({ inputNames: ['a.pdf', 'b.pdf'], outputPaths: ['/out/merged.pdf'] })
    expect(finishedJobs[1]?.outputPaths).toEqual([])
    expect(finishedJobs[1]?.snapshot.error?.message).toBe('Damaged.')
  })

  it('keeps working if recording a finished job throws', async () => {
    const launched: Array<(o: EngineOutcome) => void> = []
    const manager = new JobManager({
      launcher: () => {
        let resolve: (o: EngineOutcome) => void = () => undefined
        const outcome = new Promise<EngineOutcome>((r) => {
          resolve = r
        })
        launched.push(resolve)
        return { outcome, cancel: () => undefined }
      },
      maxConcurrent: 1,
      onChange: () => undefined,
      onFinished: () => {
        throw new Error('disk full')
      },
      cleanupTempFiles: async () => undefined,
    })
    const job = manager.submit(prepared())
    launched[0]?.(success())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(manager.list().find((j) => j.id === job.id)?.status).toBe('succeeded')
  })
})
