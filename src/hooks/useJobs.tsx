import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { isFinished } from '../../shared/job-state'
import type { JobRequest, JobSnapshot } from '../../shared/jobs'
import { bridge } from '../lib/bridge'

interface JobsContextValue {
  /** Newest first. Only jobs from the current session; saved history comes in a later phase. */
  jobs: JobSnapshot[]
  runningCount: number
  getJob: (id: string | null) => JobSnapshot | undefined
  /** Starts a job and returns its id. Rejects with a readable message if it cannot start. */
  startJob: (request: JobRequest) => Promise<string>
  cancelJob: (id: string) => Promise<void>
  revealOutput: (id: string) => Promise<void>
  openOutput: (id: string) => Promise<void>
}

const JobsContext = createContext<JobsContextValue | null>(null)

export function JobsProvider({ children }: { children: ReactNode }) {
  const [byId, setById] = useState<Record<string, JobSnapshot>>({})

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    let cancelled = false
    try {
      // Subscribe first, then load the list, so an update arriving in between is not lost.
      unsubscribe = bridge.onJobUpdated((snapshot) => {
        setById((previous) => ({ ...previous, [snapshot.id]: snapshot }))
      })
      bridge
        .listJobs()
        .then((snapshots) => {
          if (cancelled) return
          // A live update is always newer than the list, so keep what we already have.
          setById((previous) => {
            const merged = { ...previous }
            for (const snapshot of snapshots) merged[snapshot.id] ??= snapshot
            return merged
          })
        })
        .catch(() => undefined)
    } catch {
      // Running outside the desktop app (plain browser). Jobs are simply unavailable.
    }
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  const getJob = useCallback((id: string | null) => (id === null ? undefined : byId[id]), [byId])

  const value = useMemo<JobsContextValue>(() => {
    const jobs = Object.values(byId).sort((a, b) => b.createdAt - a.createdAt)
    return {
      jobs,
      runningCount: jobs.filter((job) => !isFinished(job.status)).length,
      getJob,
      startJob: bridge.startJob,
      cancelJob: bridge.cancelJob,
      revealOutput: bridge.revealJobOutput,
      openOutput: bridge.openJobOutput,
    }
  }, [byId, getJob])

  return <JobsContext.Provider value={value}>{children}</JobsContext.Provider>
}

export function useJobs(): JobsContextValue {
  const context = useContext(JobsContext)
  if (context === null) {
    throw new Error('useJobs must be used inside JobsProvider.')
  }
  return context
}
