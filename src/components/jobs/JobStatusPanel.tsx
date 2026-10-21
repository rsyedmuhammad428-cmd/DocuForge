import { useState } from 'react'
import { isFinished } from '../../../shared/job-state'
import type { JobSnapshot } from '../../../shared/jobs'
import { errorMessage } from '../../lib/bridge'
import { formatBytes, pluralize } from '../../lib/format'
import { useJobs } from '../../hooks/useJobs'
import { Button } from '../common/Button'
import { Notice } from '../common/Notice'

const STATUS_LABEL: Record<JobSnapshot['status'], string> = {
  queued: 'Waiting',
  running: 'Working',
  succeeded: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

/** Shows one job: progress while it runs, then the result, the error, or the cancellation. */
export function JobStatusPanel({ job }: { job: JobSnapshot }) {
  const { cancelJob, revealOutput, openOutput } = useJobs()
  const [actionError, setActionError] = useState<string | null>(null)

  async function run(action: () => Promise<void>) {
    setActionError(null)
    try {
      await action()
    } catch (error) {
      setActionError(errorMessage(error))
    }
  }

  const progress = job.progress
  const total = progress?.total ?? null
  const hasTotal = progress !== null && total !== null && total > 0

  return (
    <section aria-label={`Job: ${job.title}`} className="rounded-card border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="min-w-0 truncate font-medium">{job.title}</h3>
        <p aria-live="polite" className="shrink-0 text-sm text-muted">
          {STATUS_LABEL[job.status]}
        </p>
      </div>

      {job.status === 'queued' && (
        <p className="mt-2 text-sm text-muted">Waiting for another job to finish.</p>
      )}

      {job.status === 'running' && (
        <div className="mt-3 space-y-2">
          {hasTotal ? (
            <progress
              className="h-2 w-full accent-accent"
              value={progress.current}
              max={total}
              aria-label={`${job.title} progress`}
            />
          ) : (
            <progress className="h-2 w-full accent-accent" aria-label={`${job.title} progress`} />
          )}
          <p className="text-sm text-muted">
            {hasTotal ? `Step ${progress.current} of ${total}` : 'Working…'}
          </p>
        </div>
      )}

      {job.status === 'succeeded' && job.result !== null && (
        <div className="mt-3 space-y-3">
          <p className="text-sm">
            {job.result.fileCount === 1
              ? `Saved ${job.result.firstFileName}`
              : `Saved ${pluralize(job.result.fileCount, 'file')}`}{' '}
            ({formatBytes(job.result.totalBytes)}
            {job.result.pageCount !== null ? `, ${pluralize(job.result.pageCount, 'page')}` : ''}) in{' '}
            <span className="break-all">{job.result.location}</span>
          </p>
          {job.result.originalBytes !== null && job.result.originalBytes > 0 && (
            <p className="text-sm font-medium">
              Reduced from {formatBytes(job.result.originalBytes)} to {formatBytes(job.result.totalBytes)} (
              {Math.round((1 - job.result.totalBytes / job.result.originalBytes) * 100)}% smaller)
            </p>
          )}
          {job.result.preview !== null && (
            <div className="space-y-1">
              <p className="text-sm font-medium">Preview (the start of the recognized text)</p>
              <pre
                dir="auto"
                tabIndex={0}
                aria-label="Recognized text preview"
                className="max-h-64 overflow-auto whitespace-pre-wrap rounded-control border border-border bg-app p-3 text-sm"
              >
                {job.result.preview}
              </pre>
            </div>
          )}
          {job.result.note !== null && <p className="text-sm text-muted">{job.result.note}</p>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void run(() => openOutput(job.id))}>
              {job.result.fileCount === 1 ? 'Open file' : 'Open folder'}
            </Button>
            <Button onClick={() => void run(() => revealOutput(job.id))}>Show in folder</Button>
          </div>
        </div>
      )}

      {job.status === 'failed' && job.error !== null && (
        <div className="mt-3">
          <Notice>{job.error.message}</Notice>
        </div>
      )}

      {job.status === 'cancelled' && (
        <p className="mt-2 text-sm text-muted">The job was cancelled. Unfinished files were removed.</p>
      )}

      {!isFinished(job.status) && (
        <div className="mt-3">
          <Button onClick={() => void run(() => cancelJob(job.id))}>Cancel</Button>
        </div>
      )}

      {actionError !== null && (
        <div className="mt-3">
          <Notice>{actionError}</Notice>
        </div>
      )}
    </section>
  )
}
