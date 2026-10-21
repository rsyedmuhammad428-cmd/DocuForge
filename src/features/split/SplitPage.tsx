import { FolderOpen } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { FileRef, InspectResult, OutputRef } from '../../../shared/files'
import type { JobRequest } from '../../../shared/jobs'
import { countPages, parsePageRanges } from '../../../shared/page-ranges'
import { Button } from '../../components/common/Button'
import { Notice } from '../../components/common/Notice'
import { JobStatusPanel } from '../../components/jobs/JobStatusPanel'
import { useJobs } from '../../hooks/useJobs'
import { bridge, errorMessage } from '../../lib/bridge'
import { formatBytes, pluralize } from '../../lib/format'

type Mode = 'extract' | 'ranges' | 'each' | 'chunks'

const MODES: readonly { value: Mode; label: string; description: string }[] = [
  { value: 'extract', label: 'Extract pages', description: 'Pick pages and save them together as one new PDF.' },
  { value: 'ranges', label: 'Split by ranges', description: 'Save each page range as its own PDF.' },
  { value: 'each', label: 'Every page', description: 'Save each page as its own PDF.' },
  { value: 'chunks', label: 'Every N pages', description: 'Cut the document into equal parts.' },
]

interface Plan {
  /** The request to send, when the options are valid. */
  request: Omit<Extract<JobRequest, { operation: 'split' }>, 'inputId' | 'outputId'> | null
  /** Shown under the options: what will happen, or what is wrong. */
  summary: string
  problem: boolean
}

function buildPlan(mode: Mode, pageCount: number, rangeText: string, chunkText: string): Plan {
  if (mode === 'each') {
    return {
      request: { operation: 'split', mode },
      summary: `Creates ${pluralize(pageCount, 'file')}.`,
      problem: false,
    }
  }

  if (mode === 'chunks') {
    const size = Number(chunkText)
    if (chunkText.trim() === '' || !Number.isInteger(size) || size < 1) {
      return { request: null, summary: 'Enter a whole number of pages, 1 or more.', problem: chunkText.trim() !== '' }
    }
    return {
      request: { operation: 'split', mode, chunkSize: size },
      summary: `Creates ${pluralize(Math.ceil(pageCount / size), 'file')}.`,
      problem: false,
    }
  }

  const parsed = parsePageRanges(rangeText, pageCount)
  if (!parsed.ok) {
    return { request: null, summary: parsed.error, problem: rangeText.trim() !== '' }
  }
  return {
    request: { operation: 'split', mode, ranges: parsed.ranges },
    summary:
      mode === 'extract'
        ? `Creates 1 file with ${pluralize(countPages(parsed.ranges), 'page')}.`
        : `Creates ${pluralize(parsed.ranges.length, 'file')}.`,
    problem: false,
  }
}

export function SplitPage() {
  const { getJob } = useJobs()
  const [file, setFile] = useState<{ ref: FileRef; check: InspectResult | undefined } | null>(null)
  const [mode, setMode] = useState<Mode>('extract')
  const [rangeText, setRangeText] = useState('')
  const [chunkText, setChunkText] = useState('')
  const [output, setOutput] = useState<OutputRef | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)

  const latestFileId = useRef<string | null>(null)
  useEffect(() => {
    latestFileId.current = file?.ref.id ?? null
  }, [file])
  useEffect(
    () => () => {
      if (latestFileId.current !== null) void bridge.releaseFiles([latestFileId.current]).catch(() => undefined)
    },
    [],
  )

  const job = getJob(jobId)
  const jobActive = job !== undefined && (job.status === 'queued' || job.status === 'running')

  async function chooseFile() {
    setMessage(null)
    setBusy(true)
    try {
      const [ref] = await bridge.selectPdfs(false)
      if (ref === undefined) return
      if (file !== null) void bridge.releaseFiles([file.ref.id]).catch(() => undefined)
      setFile({ ref, check: undefined })
      const [check] = await bridge.inspectPdfs([ref.id])
      setFile({ ref, check })
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function chooseFolder() {
    setMessage(null)
    try {
      const folder = await bridge.selectOutputFolder()
      if (folder !== null) setOutput(folder)
    } catch (error) {
      setMessage(errorMessage(error))
    }
  }

  const pageCount = file?.check?.ok === true ? file.check.pageCount : null
  const plan = pageCount === null ? null : buildPlan(mode, pageCount, rangeText, chunkText)
  const canSplit = file !== null && plan?.request != null && output !== null && !busy && !jobActive

  async function startSplit() {
    if (file === null || plan?.request == null || output === null) return
    setMessage(null)
    setBusy(true)
    try {
      setJobId(await bridge.startJob({ ...plan.request, inputId: file.ref.id, outputId: output.id }))
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-8 py-8">
      <p className="max-w-prose text-muted">
        Split a PDF into smaller files. Your original is never changed, and existing files in the
        output folder are never overwritten.
      </p>

      <div>
        <Button variant="primary" onClick={() => void chooseFile()} disabled={busy || jobActive}>
          {file === null ? 'Choose a PDF' : 'Choose a different PDF'}
        </Button>
      </div>

      {message !== null && <Notice>{message}</Notice>}

      {file !== null && (
        <section aria-label="Selected file" className="rounded-card border border-border bg-surface p-4">
          <p className="font-medium">{file.ref.name}</p>
          <p className="text-sm text-muted">
            {formatBytes(file.ref.sizeBytes)}
            {file.check === undefined && ' · Checking…'}
            {pageCount !== null && ` · ${pluralize(pageCount, 'page')}`}
          </p>
          {file.check?.ok === false && file.check.error !== null && (
            <p role="alert" className="mt-2 text-sm">
              {file.check.error.message}
            </p>
          )}
        </section>
      )}

      {pageCount !== null && plan !== null && (
        <>
          <fieldset className="space-y-2" disabled={jobActive}>
            <legend className="mb-1 text-base font-semibold">How to split</legend>
            {MODES.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-start gap-3 rounded-card border border-border bg-surface p-3 has-checked:border-accent has-focus-visible:outline-2 has-focus-visible:outline-accent"
              >
                <input
                  type="radio"
                  name="split-mode"
                  value={option.value}
                  checked={mode === option.value}
                  onChange={() => setMode(option.value)}
                  className="mt-1 accent-accent"
                />
                <span>
                  <span className="block font-medium">{option.label}</span>
                  <span className="block text-sm text-muted">{option.description}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {(mode === 'extract' || mode === 'ranges') && (
            <div className="space-y-1">
              <label htmlFor="split-ranges" className="block font-medium">
                Pages
              </label>
              <input
                id="split-ranges"
                type="text"
                value={rangeText}
                onChange={(event) => setRangeText(event.target.value)}
                placeholder="For example: 1-3, 5, 8-"
                aria-invalid={plan.problem}
                aria-describedby="split-summary"
                disabled={jobActive}
                className="w-full rounded-control border border-border bg-surface px-3 py-2"
              />
              <p className="text-sm text-muted">
                Page numbers start at 1. Use a dash for a range, and "8-" for page 8 to the end.
              </p>
            </div>
          )}

          {mode === 'chunks' && (
            <div className="space-y-1">
              <label htmlFor="split-chunk" className="block font-medium">
                Pages per file
              </label>
              <input
                id="split-chunk"
                type="number"
                min={1}
                value={chunkText}
                onChange={(event) => setChunkText(event.target.value)}
                aria-invalid={plan.problem}
                aria-describedby="split-summary"
                disabled={jobActive}
                className="w-40 rounded-control border border-border bg-surface px-3 py-2"
              />
            </div>
          )}

          <p id="split-summary" className="text-sm" role={plan.problem ? 'alert' : undefined}>
            {plan.summary}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void chooseFolder()} disabled={jobActive}>
              <FolderOpen size={18} aria-hidden="true" />
              {output === null ? 'Choose output folder' : 'Change output folder'}
            </Button>
            {output !== null && <p className="min-w-0 break-all text-sm text-muted">{output.location}</p>}
          </div>

          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={() => void startSplit()} disabled={!canSplit}>
              Split PDF
            </Button>
            {output === null && <p className="text-sm text-muted">Choose an output folder to continue.</p>}
          </div>
        </>
      )}

      {job !== undefined && <JobStatusPanel job={job} />}
    </div>
  )
}
