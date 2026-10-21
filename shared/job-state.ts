export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

const ALLOWED_TRANSITIONS: Record<JobStatus, readonly JobStatus[]> = {
  queued: ['running', 'cancelled'],
  running: ['succeeded', 'failed', 'cancelled'],
  succeeded: [],
  failed: [],
  cancelled: [],
}

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to)
}

export function isFinished(status: JobStatus): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0
}

export function assertTransition(from: JobStatus, to: JobStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`A job cannot change from "${from}" to "${to}".`)
  }
}
