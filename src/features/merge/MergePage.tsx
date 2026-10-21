import { ArrowDown, ArrowUp, FilePlus2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { FileRef, InspectResult } from '../../../shared/files'
import { Button } from '../../components/common/Button'
import { IconButton } from '../../components/common/IconButton'
import { Notice } from '../../components/common/Notice'
import { JobStatusPanel } from '../../components/jobs/JobStatusPanel'
import { useJobs } from '../../hooks/useJobs'
import { bridge, errorMessage } from '../../lib/bridge'
import { formatBytes, pluralize } from '../../lib/format'
import { moveItem } from '../../lib/list'

interface Entry {
  ref: FileRef
  /** undefined while the file is still being checked. */
  check: InspectResult | undefined
}

export function MergePage() {
  const { getJob } = useJobs()
  const [entries, setEntries] = useState<Entry[]>([])
  const [adding, setAdding] = useState(false)
  const [starting, setStarting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)

  // Give the main process its file handles back when leaving the page.
  const latestEntries = useRef<Entry[]>([])
  useEffect(() => {
    latestEntries.current = entries
  }, [entries])
  useEffect(
    () => () => {
      const ids = latestEntries.current.map((entry) => entry.ref.id)
      if (ids.length > 0) void bridge.releaseFiles(ids).catch(() => undefined)
    },
    [],
  )

  const job = getJob(jobId)
  const jobActive = job !== undefined && (job.status === 'queued' || job.status === 'running')

  async function addFiles() {
    setMessage(null)
    setAdding(true)
    try {
      const refs = await bridge.selectPdfs(true)
      if (refs.length === 0) return
      setEntries((previous) => [...previous, ...refs.map((ref) => ({ ref, check: undefined }))])

      const checks = new Map(
        (await bridge.inspectPdfs(refs.map((ref) => ref.id))).map((check) => [check.fileId, check]),
      )
      setEntries((previous) =>
        previous.map((entry) => ({ ...entry, check: checks.get(entry.ref.id) ?? entry.check })),
      )
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setAdding(false)
    }
  }

  function removeEntry(id: string) {
    setEntries((previous) => previous.filter((entry) => entry.ref.id !== id))
    void bridge.releaseFiles([id]).catch(() => undefined)
  }

  async function startMerge() {
    setMessage(null)
    setStarting(true)
    try {
      const output = await bridge.selectOutputFile('merged.pdf')
      if (output === null) return
      setJobId(await bridge.startJob({
        operation: 'merge',
        inputIds: entries.map((entry) => entry.ref.id),
        outputId: output.id,
      }))
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setStarting(false)
    }
  }

  const checking = entries.some((entry) => entry.check === undefined)
  const problems = entries.filter((entry) => entry.check !== undefined && !entry.check.ok)
  const totalPages = entries.reduce((sum, entry) => sum + (entry.check?.pageCount ?? 0), 0)
  const canMerge =
    entries.length >= 2 && !checking && problems.length === 0 && !adding && !starting && !jobActive

  let hint = ''
  if (entries.length < 2) hint = 'Add at least two PDF files to merge.'
  else if (checking) hint = 'Checking files…'
  else if (problems.length > 0) hint = 'Remove the files with errors to continue.'

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-8 py-8">
      <p className="max-w-prose text-muted">
        Combine PDF files into one. Files are merged in the order shown. Your originals are never
        changed.
      </p>

      <div>
        <Button variant="primary" onClick={() => void addFiles()} disabled={adding || jobActive}>
          <FilePlus2 size={18} aria-hidden="true" />
          Add PDF files
        </Button>
      </div>

      {message !== null && <Notice>{message}</Notice>}

      {entries.length > 0 && (
        <section aria-labelledby="merge-files-heading" className="space-y-3">
          <h2 id="merge-files-heading" className="text-base font-semibold">
            Files to merge
          </h2>
          <ol className="divide-y divide-border rounded-card border border-border bg-surface">
            {entries.map((entry, index) => (
              <li key={entry.ref.id} className="flex items-center gap-3 p-3">
                <span className="w-6 shrink-0 text-center text-muted">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{entry.ref.name}</p>
                  <p className="text-sm text-muted">
                    {formatBytes(entry.ref.sizeBytes)}
                    {entry.check === undefined && ' · Checking…'}
                    {entry.check?.ok === true &&
                      entry.check.pageCount !== null &&
                      ` · ${pluralize(entry.check.pageCount, 'page')}`}
                  </p>
                  {entry.check?.ok === false && entry.check.error !== null && (
                    <p className="mt-1 text-sm" role="alert">
                      {entry.check.error.message}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <IconButton
                    label={`Move ${entry.ref.name} up`}
                    disabled={index === 0 || jobActive}
                    onClick={() => setEntries((previous) => moveItem(previous, index, index - 1))}
                  >
                    <ArrowUp size={16} aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    label={`Move ${entry.ref.name} down`}
                    disabled={index === entries.length - 1 || jobActive}
                    onClick={() => setEntries((previous) => moveItem(previous, index, index + 1))}
                  >
                    <ArrowDown size={16} aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    label={`Remove ${entry.ref.name}`}
                    disabled={jobActive}
                    onClick={() => removeEntry(entry.ref.id)}
                  >
                    <X size={16} aria-hidden="true" />
                  </IconButton>
                </div>
              </li>
            ))}
          </ol>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={() => void startMerge()} disabled={!canMerge}>
              Merge PDFs
            </Button>
            <p className="text-sm text-muted">
              {hint !== ''
                ? hint
                : `${pluralize(entries.length, 'file')}, ${pluralize(totalPages, 'page')} in total`}
            </p>
          </div>
        </section>
      )}

      {job !== undefined && <JobStatusPanel job={job} />}
    </div>
  )
}
