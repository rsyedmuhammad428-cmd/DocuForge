import { useCallback, useEffect, useState } from 'react'
import type { FileKind } from '../../../shared/files'
import type { ToolsStatus } from '../../../shared/ipc'
import { parseOptionalPageRanges } from '../../../shared/page-ranges'
import { Button } from '../../components/common/Button'
import { FileSummary } from '../../components/common/FileSummary'
import { Notice } from '../../components/common/Notice'
import { JobStatusPanel } from '../../components/jobs/JobStatusPanel'
import { useJobRunner } from '../../hooks/useJobRunner'
import { useSingleFile } from '../../hooks/useSingleFile'
import { bridge, errorMessage } from '../../lib/bridge'
import { defaultLanguages, languageLabel } from './languages'

type Status = { state: 'checking' } | { state: 'ready'; tools: ToolsStatus } | { state: 'error'; message: string }

const DPI_OPTIONS = [
  { value: 150, label: '150 dpi (fast, for clear scans)' },
  { value: 200, label: '200 dpi' },
  { value: 300, label: '300 dpi (recommended)' },
  { value: 400, label: '400 dpi (slow, for small print)' },
] as const

export function OcrPage() {
  const [kind, setKind] = useState<Extract<FileKind, 'pdf' | 'image'>>('pdf')

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-8 py-8">
      <p className="max-w-prose text-muted">
        Read the text of scanned documents and photos of text. Recognition runs on this computer with
        the free Tesseract program; nothing is uploaded. Your original is never changed.
      </p>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-base font-semibold">What do you want to read?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              { value: 'pdf', label: 'A scanned PDF', description: 'Pages that are pictures of text.' },
              { value: 'image', label: 'An image', description: 'A photo or scan: PNG, JPEG, TIFF and more.' },
            ] as const
          ).map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-start gap-3 rounded-card border border-border bg-surface p-3 has-checked:border-accent has-checked:bg-subtle has-focus-visible:outline-2 has-focus-visible:outline-accent"
            >
              <input
                type="radio"
                name="ocr-kind"
                checked={kind === option.value}
                onChange={() => setKind(option.value)}
                className="mt-1 accent-accent"
              />
              <span>
                <span className="block font-medium">{option.label}</span>
                <span className="block text-sm text-muted">{option.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* The key gives each kind a fresh form, so a file from the other kind is released. */}
      <OcrForm key={kind} kind={kind} />
    </div>
  )
}

function OcrForm({ kind }: { kind: 'pdf' | 'image' }) {
  const source = useSingleFile(kind)
  const runner = useJobRunner()
  const [status, setStatus] = useState<Status>({ state: 'checking' })
  const [chosenLanguages, setChosenLanguages] = useState<string[] | null>(null)
  const [format, setFormat] = useState<'text' | 'pdf'>('text')
  const [dpi, setDpi] = useState(300)
  const [useExistingText, setUseExistingText] = useState(true)
  const [pageMarkers, setPageMarkers] = useState(true)
  const [rangeText, setRangeText] = useState('')

  const lookup = useCallback(async (): Promise<Status> => {
    try {
      return { state: 'ready', tools: await bridge.getToolsStatus() }
    } catch (error) {
      return { state: 'error', message: errorMessage(error) }
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void lookup().then((result) => {
      if (!cancelled) setStatus(result)
    })
    return () => {
      cancelled = true
    }
  }, [lookup])

  function checkAgain() {
    setStatus({ state: 'checking' })
    void lookup().then(setStatus)
  }

  const installed = status.state === 'ready' ? status.tools.tesseract.languages : []
  const tesseractFound = status.state === 'ready' && status.tools.tesseract.found
  // Until the user picks languages, the default is used. Languages that are no longer installed are dropped.
  const languages = (chosenLanguages ?? defaultLanguages(installed)).filter((code) => installed.includes(code))

  const isPdf = kind === 'pdf'
  const parsed =
    isPdf && source.pageCount !== null ? parseOptionalPageRanges(rangeText, source.pageCount) : { ok: true as const, ranges: undefined }
  const canRun =
    tesseractFound && languages.length > 0 && source.usable && parsed.ok && !source.busy && !runner.locked

  function toggleLanguage(code: string) {
    setChosenLanguages(languages.includes(code) ? languages.filter((l) => l !== code) : [...languages, code].slice(0, 5))
  }

  function run() {
    const file = source.file
    if (file === null || !parsed.ok) return
    void runner.start(async () => {
      const base = file.ref.name.replace(/\.[^.]+$/, '')
      const output = await bridge.selectOutputFile(
        format === 'text' ? `${base}_text.txt` : `${base}_searchable.pdf`,
        format === 'text' ? 'text' : 'pdf',
      )
      if (output === null) return null
      return {
        operation: 'ocr',
        inputId: file.ref.id,
        outputId: output.id,
        format,
        languages,
        dpi,
        useExistingText: isPdf && useExistingText,
        pageMarkers: format === 'text' && pageMarkers,
        ranges: parsed.ranges,
      }
    })
  }

  return (
    <div className="space-y-6">
      {status.state === 'checking' && <p className="text-muted">Looking for Tesseract…</p>}
      {status.state === 'error' && <Notice>{status.message}</Notice>}
      {status.state === 'ready' && !status.tools.tesseract.found && (
        <Notice>
          <p>
            Tesseract OCR was not found on this computer. It is free. Install it (the Tesseract
            documentation lists Windows installers), choose the languages you need during setup, then
            check again.
          </p>
          <Button className="mt-2" onClick={checkAgain}>
            Check again
          </Button>
        </Notice>
      )}
      {status.state === 'ready' && status.tools.tesseract.found && installed.length === 0 && (
        <Notice>Tesseract is installed, but no language data was found. Install a language, then check again.</Notice>
      )}

      <div>
        <Button variant="primary" onClick={() => void source.choose()} disabled={source.busy || runner.locked}>
          {source.file === null ? (isPdf ? 'Choose a scanned PDF' : 'Choose an image') : 'Choose a different file'}
        </Button>
      </div>
      {source.message !== null && <Notice>{source.message}</Notice>}
      {source.file !== null && (
        <FileSummary
          name={source.file.ref.name}
          sizeBytes={source.file.ref.sizeBytes}
          checking={source.file.check === undefined && isPdf}
          pageCount={source.pageCount}
          error={source.problem}
        />
      )}

      {tesseractFound && installed.length > 0 && (
        <>
          <fieldset className="space-y-2" disabled={runner.locked}>
            <legend className="mb-1 text-base font-semibold">Language of the text</legend>
            <div className="flex flex-wrap gap-2">
              {installed.map((code) => (
                <label
                  key={code}
                  className="flex cursor-pointer items-center gap-2 rounded-control border border-border bg-surface px-3 py-2 has-checked:border-accent has-checked:bg-subtle has-focus-visible:outline-2 has-focus-visible:outline-accent"
                >
                  <input
                    type="checkbox"
                    checked={languages.includes(code)}
                    onChange={() => toggleLanguage(code)}
                    className="accent-accent"
                  />
                  {languageLabel(code)}
                </label>
              ))}
            </div>
            <p className="text-sm text-muted">
              Choose every language that appears (up to 5). Results depend on the scan quality, the
              language and the script, and are never perfect. More languages can be added in
              Tesseract's installer.
            </p>
          </fieldset>

          <fieldset className="space-y-2" disabled={runner.locked}>
            <legend className="mb-1 text-base font-semibold">Result</legend>
            {(
              [
                { value: 'text', label: 'Text file (.txt)', description: 'Just the recognized text, with a preview here.' },
                {
                  value: 'pdf',
                  label: 'Searchable PDF',
                  description: 'The same pages with a hidden text layer, so you can search and copy. The file can be larger than the original.',
                },
              ] as const
            ).map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-start gap-3 rounded-card border border-border bg-surface p-3 has-checked:border-accent has-focus-visible:outline-2 has-focus-visible:outline-accent"
              >
                <input
                  type="radio"
                  name="ocr-format"
                  checked={format === option.value}
                  onChange={() => setFormat(option.value)}
                  className="mt-1 accent-accent"
                />
                <span>
                  <span className="block font-medium">{option.label}</span>
                  <span className="block text-sm text-muted">{option.description}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="space-y-1">
            <label htmlFor="ocr-dpi" className="block font-medium">
              Scan detail
            </label>
            <select
              id="ocr-dpi"
              value={dpi}
              onChange={(event) => setDpi(Number(event.target.value))}
              disabled={runner.locked}
              className="w-full max-w-sm rounded-control border border-border bg-surface px-3 py-2"
            >
              {DPI_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {isPdf && (
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={useExistingText}
                onChange={(event) => setUseExistingText(event.target.checked)}
                disabled={runner.locked}
                className="accent-accent"
              />
              <span>Use text a page already has, and only read pages that are pictures</span>
            </label>
          )}
          {format === 'text' && (
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={pageMarkers}
                onChange={(event) => setPageMarkers(event.target.checked)}
                disabled={runner.locked}
                className="accent-accent"
              />
              <span>Add a "Page N" line before each page</span>
            </label>
          )}

          {isPdf && source.pageCount !== null && (
            <div className="space-y-1">
              <label htmlFor="ocr-pages" className="block font-medium">
                Pages (optional)
              </label>
              <input
                id="ocr-pages"
                type="text"
                value={rangeText}
                onChange={(event) => setRangeText(event.target.value)}
                placeholder="Leave empty for every page, or type 1-3, 5"
                aria-invalid={!parsed.ok}
                aria-describedby="ocr-pages-help"
                disabled={runner.locked}
                className="w-full rounded-control border border-border bg-surface px-3 py-2"
              />
              <p id="ocr-pages-help" className="text-sm" role={parsed.ok ? undefined : 'alert'}>
                {parsed.ok ? 'Reading a page takes a few seconds. Long documents take a while.' : parsed.error}
              </p>
            </div>
          )}

          <Button variant="primary" onClick={run} disabled={!canRun}>
            Recognize text
          </Button>
        </>
      )}

      {runner.message !== null && <Notice>{runner.message}</Notice>}
      {runner.job !== undefined && <JobStatusPanel job={runner.job} />}
    </div>
  )
}
