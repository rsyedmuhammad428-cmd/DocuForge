import { History } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { isFinished } from '../../../shared/job-state'
import type { HistoryEntryView } from '../../../shared/history'
import { Button } from '../../components/common/Button'
import { Notice } from '../../components/common/Notice'
import { useJobs } from '../../hooks/useJobs'
import { useSettings } from '../../hooks/useSettings'
import { bridge, errorMessage } from '../../lib/bridge'
import { formatBytes } from '../../lib/format'

type Load = { state: 'loading' } | { state: 'ready'; entries: HistoryEntryView[] } | { state: 'error'; message: string }

const STATUS_LABEL = { succeeded: 'Done', failed: 'Failed', cancelled: 'Cancelled' } as const

export function RecentPage() {
  const { jobs } = useJobs()
  const { state: settingsState } = useSettings()
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmingClear, setConfirmingClear] = useState(false)

  // Reload when a job in this session finishes, so its entry appears without leaving the page.
  const finishedCount = jobs.filter((job) => isFinished(job.status)).length

  const reload = useCallback(async (): Promise<Load> => {
    try {
      return { state: 'ready', entries: await bridge.listHistory() }
    } catch (error) {
      return { state: 'error', message: errorMessage(error) }
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void reload().then((result) => {
      if (!cancelled) setLoad(result)
    })
    return () => {
      cancelled = true
    }
  }, [reload, finishedCount])

  async function act(action: () => Promise<void>) {
    setActionError(null)
    try {
      await action()
    } catch (error) {
      setActionError(errorMessage(error))
    }
    // The file may have turned out to be missing, so refresh what is shown as available.
    setLoad(await reload())
  }

  const historyOff = settingsState.status === 'ready' && !settingsState.settings.saveHistory
  const entries = load.state === 'ready' ? load.entries : []

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-8 py-8">
      <p className="max-w-prose text-muted">
        Results from your earlier jobs. DocuForge remembers file names and where results were saved,
        never what is inside your documents. You can turn this off or clear it in Settings.
      </p>

      {historyOff && <Notice>History is turned off, so new jobs are not added. Turn it on in Settings.</Notice>}
      {load.state === 'error' && <Notice>{load.message}</Notice>}
      {actionError !== null && <Notice>{actionError}</Notice>}
      {load.state === 'loading' && <p className="text-muted">Loading…</p>}

      {load.state === 'ready' && entries.length === 0 && (
        <div className="flex items-center gap-3 rounded-card border border-border bg-surface p-4 text-muted">
          <History size={20} aria-hidden="true" />
          <p>Nothing here yet. Finished jobs will appear in this list.</p>
        </div>
      )}

      {entries.length > 0 && (
        <>
          <ul className="divide-y divide-border rounded-card border border-border bg-surface">
            {entries.map((entry) => (
              <li key={entry.id} className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 font-medium">{entry.title}</p>
                  <p className="shrink-0 text-sm text-muted">{STATUS_LABEL[entry.status]}</p>
                </div>
                <p className="text-sm text-muted">{new Date(entry.finishedAt).toLocaleString()}</p>

                {entry.status === 'succeeded' && entry.outputName !== null && (
                  <p className="text-sm">
                    {entry.outputCount > 1 ? `${entry.outputCount} files` : entry.outputName}
                    {entry.totalBytes !== null && ` (${formatBytes(entry.totalBytes)})`}
                    {entry.outputLocation !== null && (
                      <>
                        {' '}
                        in <span className="break-all">{entry.outputLocation}</span>
                      </>
                    )}
                  </p>
                )}
                {entry.status === 'failed' && entry.errorMessage !== null && (
                  <p className="text-sm">{entry.errorMessage}</p>
                )}

                {entry.status === 'succeeded' &&
                  (entry.available ? (
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => void act(() => bridge.openHistoryEntry(entry.id))}>
                        {entry.outputCount > 1 ? 'Open folder' : 'Open file'}
                      </Button>
                      <Button onClick={() => void act(() => bridge.revealHistoryEntry(entry.id))}>
                        Show in folder
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted">The file is no longer there. It may have been moved or deleted.</p>
                  ))}
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-3">
            {!confirmingClear ? (
              <Button onClick={() => setConfirmingClear(true)}>Clear history</Button>
            ) : (
              <>
                <p className="text-sm">Remove all entries from this list? Your files are not deleted.</p>
                <Button
                  variant="primary"
                  onClick={() => {
                    setConfirmingClear(false)
                    void act(() => bridge.clearHistory())
                  }}
                >
                  Yes, clear it
                </Button>
                <Button onClick={() => setConfirmingClear(false)}>Cancel</Button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
