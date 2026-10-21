import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { OutputDataSchema, type EngineOutcome } from '../../shared/engine-protocol'
import { assertTransition, isFinished, type JobStatus } from '../../shared/job-state'
import type { JobSnapshot } from '../../shared/jobs'
import type { EngineLauncher, EngineProcess } from './engine-process'
import type { PreparedJob } from './job-preparer'

export interface FinishedJobInfo {
  snapshot: JobSnapshot
  outputPaths: string[]
  inputNames: string[]
}

export interface JobManagerOptions {
  launcher: EngineLauncher
  /** How many jobs may run at the same time. Others wait in the queue. */
  maxConcurrent: number
  onChange: (snapshot: JobSnapshot) => void
  /** Called once when a job ends, however it ends. Used to write the history. */
  onFinished?: (info: FinishedJobInfo) => void
  cleanupTempFiles: (directory: string, jobId: string) => Promise<unknown>
  now?: () => number
  newId?: () => string
  /** Finished jobs kept in memory. Persistent history arrives in a later phase. */
  maxFinishedJobs?: number
}

interface JobRecord {
  snapshot: JobSnapshot
  prepared: PreparedJob
  outputPaths: string[]
  process: EngineProcess | undefined
  cancelRequested: boolean
  lastProgressAt: number
  done: Promise<void>
  markDone: () => void
}

const PROGRESS_INTERVAL_MS = 100

/**
 * Owns the life cycle of every job: queued, running, then succeeded, failed or cancelled.
 * It never touches files itself; it only asks the engine to, and reports what happened.
 */
export class JobManager {
  private readonly jobs = new Map<string, JobRecord>()
  private readonly queue: string[] = []
  private running = 0
  private readonly options: JobManagerOptions
  private readonly now: () => number
  private readonly newId: () => string

  constructor(options: JobManagerOptions) {
    this.options = options
    this.now = options.now ?? Date.now
    this.newId = options.newId ?? randomUUID
  }

  submit(prepared: PreparedJob): JobSnapshot {
    const id = this.newId()
    let markDone: () => void = () => undefined
    const done = new Promise<void>((resolve) => {
      markDone = resolve
    })

    const record: JobRecord = {
      snapshot: {
        id,
        operation: prepared.operation,
        title: prepared.title,
        status: 'queued',
        progress: null,
        createdAt: this.now(),
        finishedAt: null,
        result: null,
        error: null,
      },
      prepared,
      outputPaths: [],
      process: undefined,
      cancelRequested: false,
      lastProgressAt: 0,
      done,
      markDone,
    }
    this.jobs.set(id, record)
    this.queue.push(id)
    this.emit(record)
    this.pump()
    return { ...record.snapshot }
  }

  cancel(id: string): boolean {
    const record = this.jobs.get(id)
    if (record === undefined || isFinished(record.snapshot.status)) return false

    if (record.snapshot.status === 'queued') {
      this.queue.splice(this.queue.indexOf(id), 1)
      this.finish(record, 'cancelled')
      return true
    }

    record.cancelRequested = true
    record.process?.cancel()
    return true
  }

  list(): JobSnapshot[] {
    return [...this.jobs.values()].map((record) => ({ ...record.snapshot }))
  }

  getOutputPaths(id: string): string[] | undefined {
    return this.jobs.get(id)?.outputPaths
  }

  hasActiveJobs(): boolean {
    return [...this.jobs.values()].some((record) => !isFinished(record.snapshot.status))
  }

  /** Cancels everything and waits until every job has stopped and cleaned up. */
  async shutdown(): Promise<void> {
    const active = [...this.jobs.keys()]
    for (const id of active) this.cancel(id)
    await Promise.all(active.map((id) => this.jobs.get(id)?.done))
  }

  private pump(): void {
    while (this.running < this.options.maxConcurrent) {
      const id = this.queue.shift()
      if (id === undefined) return
      const record = this.jobs.get(id)
      if (record !== undefined) void this.run(record)
    }
  }

  private async run(record: JobRecord): Promise<void> {
    this.running += 1
    this.transition(record, 'running')

    let outcome: EngineOutcome
    try {
      record.process = this.options.launcher(
        { id: record.snapshot.id, ...record.prepared.engine },
        (progress) => this.onProgress(record, progress),
      )
      if (record.cancelRequested) record.process.cancel()
      outcome = await record.process.outcome
    } catch (error) {
      console.error('The engine could not be launched.', error)
      outcome = { kind: 'error', code: 'ENGINE_UNAVAILABLE', message: 'The PDF engine could not be started.' }
    }

    await this.complete(record, outcome)
    this.running -= 1
    this.pump()
  }

  private async complete(record: JobRecord, outcome: EngineOutcome): Promise<void> {
    if (outcome.kind === 'result') {
      const parsed = OutputDataSchema.safeParse(outcome.data)
      if (parsed.success) {
        const data = parsed.data
        const first = data.outputPaths[0] ?? ''
        record.outputPaths = data.outputPaths
        record.snapshot.result = {
          fileCount: data.outputPaths.length,
          firstFileName: path.basename(first),
          location: data.outputDirectory ?? path.dirname(first),
          totalBytes: data.sizeBytes,
          pageCount: data.pageCount ?? null,
          originalBytes: data.originalBytes ?? null,
          note: data.note ?? null,
          preview: data.preview ?? null,
        }
        this.finish(record, 'succeeded')
        return
      }
      outcome = {
        kind: 'error',
        code: 'ENGINE_BAD_RESPONSE',
        message: 'The PDF engine sent an unexpected result.',
      }
    }

    // Anything that did not succeed must not leave temporary files behind.
    try {
      await this.options.cleanupTempFiles(record.prepared.outputDirectory, record.snapshot.id)
    } catch (error) {
      console.error('Temporary files could not be cleaned up.', error)
    }

    if (record.cancelRequested || outcome.code === 'CANCELLED') {
      this.finish(record, 'cancelled')
    } else {
      record.snapshot.error = { code: outcome.code, message: outcome.message }
      this.finish(record, 'failed')
    }
  }

  private onProgress(record: JobRecord, progress: { current: number; total: number | null }): void {
    if (isFinished(record.snapshot.status)) return
    const now = this.now()
    const isLast = progress.total !== null && progress.current >= progress.total
    if (!isLast && now - record.lastProgressAt < PROGRESS_INTERVAL_MS) return
    record.lastProgressAt = now
    record.snapshot.progress = { current: progress.current, total: progress.total }
    this.emit(record)
  }

  private transition(record: JobRecord, to: JobStatus): void {
    assertTransition(record.snapshot.status, to)
    record.snapshot.status = to
    this.emit(record)
  }

  private finish(record: JobRecord, status: 'succeeded' | 'cancelled' | 'failed'): void {
    record.snapshot.finishedAt = this.now()
    this.transition(record, status)
    try {
      this.options.onFinished?.({
        snapshot: { ...record.snapshot },
        outputPaths: [...record.outputPaths],
        inputNames: [...record.prepared.inputNames],
      })
    } catch (error) {
      console.error('The finished job could not be recorded.', error)
    }
    record.markDone()
    this.trimFinished()
  }

  private emit(record: JobRecord): void {
    this.options.onChange({ ...record.snapshot })
  }

  private trimFinished(): void {
    const limit = this.options.maxFinishedJobs ?? 50
    const finished = [...this.jobs.values()].filter((r) => isFinished(r.snapshot.status))
    for (const record of finished.slice(0, Math.max(0, finished.length - limit))) {
      this.jobs.delete(record.snapshot.id)
    }
  }
}
