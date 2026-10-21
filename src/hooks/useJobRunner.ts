import { useState } from 'react'
import type { JobRequest } from '../../shared/jobs'
import { errorMessage } from '../lib/bridge'
import { useJobs } from './useJobs'

/** Starts one job at a time on a page and follows it. */
export function useJobRunner() {
  const { getJob, startJob } = useJobs()
  const [jobId, setJobId] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const job = getJob(jobId)
  const active = job !== undefined && (job.status === 'queued' || job.status === 'running')

  /**
   * `prepare` asks the user where to save (if needed) and returns the request,
   * or null if the user cancelled the dialog.
   */
  async function start(prepare: () => Promise<JobRequest | null>) {
    setMessage(null)
    setStarting(true)
    try {
      const request = await prepare()
      if (request !== null) setJobId(await startJob(request))
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setStarting(false)
    }
  }

  return { job, active, starting, message, start, locked: active || starting }
}
