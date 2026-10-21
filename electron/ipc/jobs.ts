import { shell } from 'electron'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { IPC_CHANNELS } from '../../shared/ipc'
import { JobRequestSchema } from '../../shared/jobs'
import type { FileRegistry } from '../services/file-registry'
import type { JobManager } from '../services/job-manager'
import { JobRequestError, prepareJob } from '../services/job-preparer'
import { noInput, UserFacingError, type HandleFn } from './handler'

const jobIdSchema = z.string().min(1).max(100)

export function registerJobHandlers(
  handle: HandleFn,
  deps: { jobs: JobManager; registry: FileRegistry },
): void {
  const { jobs, registry } = deps

  const firstOutput = (jobId: string): { first: string; count: number } => {
    const paths = jobs.getOutputPaths(jobId) ?? []
    const first = paths[0]
    // Results are references: check they are still there before pointing the user at them.
    if (first === undefined || !existsSync(first)) {
      throw new UserFacingError('OPERATION_FAILED', 'The result is no longer at its saved location.')
    }
    return { first, count: paths.length }
  }

  handle(
    IPC_CHANNELS.jobsStart,
    (raw) => JobRequestSchema.parse(raw),
    (request) => {
      try {
        return { jobId: jobs.submit(prepareJob(request, registry)).id }
      } catch (error) {
        if (error instanceof JobRequestError) throw new UserFacingError('INVALID_REQUEST', error.message)
        throw error
      }
    },
  )

  handle(IPC_CHANNELS.jobsCancel, (raw) => jobIdSchema.parse(raw), (jobId) => {
    jobs.cancel(jobId)
    return null
  })

  handle(IPC_CHANNELS.jobsList, noInput, () => jobs.list())

  handle(IPC_CHANNELS.jobsRevealOutput, (raw) => jobIdSchema.parse(raw), (jobId) => {
    shell.showItemInFolder(firstOutput(jobId).first)
    return null
  })

  handle(IPC_CHANNELS.jobsOpenOutput, (raw) => jobIdSchema.parse(raw), async (jobId) => {
    const { first, count } = firstOutput(jobId)
    // One result: open the file. Several results: open the folder that holds them.
    const error = await shell.openPath(count === 1 ? first : path.dirname(first))
    if (error !== '') throw new UserFacingError('OPERATION_FAILED', 'The result could not be opened.')
    return null
  })
}
