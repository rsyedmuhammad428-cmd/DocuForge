import {
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  RotateCw,
  Trash2,
  Undo2,
} from 'lucide-react'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { FileRef, InspectResult } from '../../../shared/files'
import { Button } from '../../components/common/Button'
import { Notice } from '../../components/common/Notice'
import { JobStatusPanel } from '../../components/jobs/JobStatusPanel'
import { useJobs } from '../../hooks/useJobs'
import { bridge, errorMessage } from '../../lib/bridge'
import { formatBytes, pluralize } from '../../lib/format'
import { PageCard } from './PageCard'
import {
  createPages,
  deleteSelected,
  hasChanges,
  moveSelected,
  rotateSelected,
  selectedCount,
  setAllSelected,
  toExportPages,
  toggleSelected,
  type PageItem,
} from './page-model'
import { ThumbnailLoader } from './thumbnail-loader'

export function OrganizePage() {
  const [file, setFile] = useState<{ ref: FileRef; check: InspectResult | undefined } | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

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

  const pageCount = file?.check?.ok === true ? file.check.pageCount : null

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-8 py-8">
      <p className="max-w-prose text-muted">
        Reorder, turn, or remove pages, then save the result as a new PDF. Your original is never
        changed.
      </p>

      <div>
        <Button variant="primary" onClick={() => void chooseFile()} disabled={busy}>
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

      {/* The key gives each chosen file a fresh workspace, with its own pages and previews. */}
      {file !== null && pageCount !== null && (
        <Workspace key={file.ref.id} file={file.ref} pageCount={pageCount} />
      )}
    </div>
  )
}

export function Workspace({ file, pageCount }: { file: FileRef; pageCount: number }) {
  const { getJob } = useJobs()
  const [pages, setPages] = useState<PageItem[]>(() => createPages(pageCount))
  const [jobId, setJobId] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [, redraw] = useReducer((count: number) => count + 1, 0)

  const [loader] = useState(
    () =>
      new ThumbnailLoader({
        fetchBatch: (batch) => bridge.getThumbnails(file.id, batch),
        onChange: redraw,
      }),
  )
  useEffect(() => {
    loader.start()
    return () => loader.dispose()
  }, [loader])

  const requestThumbnail = useCallback((sourceIndex: number) => loader.request(sourceIndex), [loader])
  const toggle = useCallback((sourceIndex: number) => setPages((p) => toggleSelected(p, sourceIndex)), [])

  const job = getJob(jobId)
  const jobActive = job !== undefined && (job.status === 'queued' || job.status === 'running')
  const selected = selectedCount(pages)
  const noneSelected = selected === 0
  const locked = jobActive || starting

  async function save(onlySelected: boolean) {
    setMessage(null)
    setStarting(true)
    try {
      const base = file.name.replace(/\.pdf$/i, '')
      const output = await bridge.selectOutputFile(
        onlySelected ? `${base}_selected.pdf` : `${base}_organized.pdf`,
      )
      if (output === null) return
      setJobId(
        await bridge.startJob({
          operation: 'organize',
          inputId: file.id,
          outputId: output.id,
          pages: toExportPages(pages, onlySelected),
        }),
      )
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setStarting(false)
    }
  }

  return (
    <section aria-label="Pages" className="space-y-4">
      <div className="sticky top-0 z-10 -mx-2 space-y-3 bg-app px-2 py-3">
        <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Page actions">
          <Button onClick={() => setPages((p) => setAllSelected(p, true))} disabled={locked}>
            Select all
          </Button>
          <Button onClick={() => setPages((p) => setAllSelected(p, false))} disabled={locked || noneSelected}>
            Select none
          </Button>
          <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
          <Button onClick={() => setPages((p) => rotateSelected(p, 270))} disabled={locked || noneSelected}>
            <RotateCcw size={16} aria-hidden="true" />
            Turn left
          </Button>
          <Button onClick={() => setPages((p) => rotateSelected(p, 90))} disabled={locked || noneSelected}>
            <RotateCw size={16} aria-hidden="true" />
            Turn right
          </Button>
          <Button onClick={() => setPages((p) => moveSelected(p, -1))} disabled={locked || noneSelected}>
            <ArrowLeft size={16} aria-hidden="true" />
            Move earlier
          </Button>
          <Button onClick={() => setPages((p) => moveSelected(p, 1))} disabled={locked || noneSelected}>
            <ArrowRight size={16} aria-hidden="true" />
            Move later
          </Button>
          <Button onClick={() => setPages((p) => deleteSelected(p))} disabled={locked || noneSelected}>
            <Trash2 size={16} aria-hidden="true" />
            Delete
          </Button>
          <Button
            onClick={() => setPages(createPages(pageCount))}
            disabled={locked || (!hasChanges(pages, pageCount) && noneSelected)}
          >
            <Undo2 size={16} aria-hidden="true" />
            Reset
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={() => void save(false)} disabled={locked || pages.length === 0}>
            Save all {pluralize(pages.length, 'page')} as new PDF
          </Button>
          <Button onClick={() => void save(true)} disabled={locked || noneSelected}>
            Save {pluralize(selected, 'selected page')} as new PDF
          </Button>
          <p className="text-sm text-muted">
            {pluralize(pages.length, 'page')}, {selected} selected
          </p>
        </div>
      </div>

      {message !== null && <Notice>{message}</Notice>}
      {loader.error !== null && (
        <Notice>
          <p>Page previews could not be loaded: {loader.error}</p>
          <Button className="mt-2" onClick={() => loader.retry()}>
            Try again
          </Button>
        </Notice>
      )}
      {job !== undefined && <JobStatusPanel job={job} />}

      {pages.length === 0 ? (
        <p className="rounded-card border border-border bg-surface p-4 text-muted">
          Every page was removed. Use Reset to bring the pages back.
        </p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
          {pages.map((item, position) => (
            <li key={item.sourceIndex}>
              <PageCard
                item={item}
                position={position + 1}
                thumbnail={loader.get(item.sourceIndex)}
                onToggle={toggle}
                onNeedThumbnail={requestThumbnail}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
