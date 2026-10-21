import { FolderOpen } from 'lucide-react'
import { useState } from 'react'
import type { OutputRef } from '../../../../shared/files'
import { countPages, parseOptionalPageRanges } from '../../../../shared/page-ranges'
import { Button } from '../../../components/common/Button'
import { FileSummary } from '../../../components/common/FileSummary'
import { Notice } from '../../../components/common/Notice'
import { JobStatusPanel } from '../../../components/jobs/JobStatusPanel'
import { useJobRunner } from '../../../hooks/useJobRunner'
import { useSingleFile } from '../../../hooks/useSingleFile'
import { bridge, errorMessage } from '../../../lib/bridge'
import { pluralize } from '../../../lib/format'

const DPI_OPTIONS = [
  { value: 72, label: '72 dpi (small, for screens)' },
  { value: 100, label: '100 dpi' },
  { value: 150, label: '150 dpi (recommended)' },
  { value: 200, label: '200 dpi' },
  { value: 300, label: '300 dpi (large, for printing)' },
] as const

export function PdfToImagesForm() {
  const source = useSingleFile('pdf')
  const runner = useJobRunner()
  const [format, setFormat] = useState<'png' | 'jpeg'>('png')
  const [dpi, setDpi] = useState(150)
  const [rangeText, setRangeText] = useState('')
  const [output, setOutput] = useState<OutputRef | null>(null)
  const [folderMessage, setFolderMessage] = useState<string | null>(null)

  const parsed = source.pageCount === null ? null : parseOptionalPageRanges(rangeText, source.pageCount)
  const imageCount =
    source.pageCount === null || parsed === null || !parsed.ok
      ? null
      : parsed.ranges === undefined
        ? source.pageCount
        : countPages(parsed.ranges)
  const canConvert = source.usable && parsed?.ok === true && output !== null && !source.busy && !runner.locked

  async function chooseFolder() {
    setFolderMessage(null)
    try {
      const folder = await bridge.selectOutputFolder()
      if (folder !== null) setOutput(folder)
    } catch (error) {
      setFolderMessage(errorMessage(error))
    }
  }

  function convert() {
    const file = source.file
    if (file === null || parsed === null || !parsed.ok || output === null) return
    void runner.start(async () => ({
      operation: 'pdf_to_images',
      inputId: file.ref.id,
      outputId: output.id,
      format,
      dpi,
      ranges: parsed.ranges,
    }))
  }

  return (
    <div className="space-y-6">
      <div>
        <Button variant="primary" onClick={() => void source.choose()} disabled={source.busy || runner.locked}>
          {source.file === null ? 'Choose a PDF' : 'Choose a different PDF'}
        </Button>
      </div>
      {source.message !== null && <Notice>{source.message}</Notice>}
      {source.file !== null && (
        <FileSummary
          name={source.file.ref.name}
          sizeBytes={source.file.ref.sizeBytes}
          checking={source.file.check === undefined}
          pageCount={source.pageCount}
          error={source.problem}
        />
      )}

      {source.usable && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="image-format" className="block font-medium">
                Picture type
              </label>
              <select
                id="image-format"
                value={format}
                onChange={(event) => setFormat(event.target.value === 'jpeg' ? 'jpeg' : 'png')}
                disabled={runner.locked}
                className="w-full rounded-control border border-border bg-surface px-3 py-2"
              >
                <option value="png">PNG (sharp, larger files)</option>
                <option value="jpeg">JPEG (smaller files)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="image-dpi" className="block font-medium">
                Resolution
              </label>
              <select
                id="image-dpi"
                value={dpi}
                onChange={(event) => setDpi(Number(event.target.value))}
                disabled={runner.locked}
                className="w-full rounded-control border border-border bg-surface px-3 py-2"
              >
                {DPI_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="image-pages" className="block font-medium">
              Pages (optional)
            </label>
            <input
              id="image-pages"
              type="text"
              value={rangeText}
              onChange={(event) => setRangeText(event.target.value)}
              placeholder="Leave empty for every page, or type 1-3, 5"
              aria-invalid={parsed !== null && !parsed.ok}
              aria-describedby="image-summary"
              disabled={runner.locked}
              className="w-full rounded-control border border-border bg-surface px-3 py-2"
            />
          </div>
          <p id="image-summary" className="text-sm" role={parsed !== null && !parsed.ok ? 'alert' : undefined}>
            {parsed !== null && !parsed.ok
              ? parsed.error
              : imageCount !== null && `Creates ${pluralize(imageCount, 'picture')}, one per page.`}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void chooseFolder()} disabled={runner.locked}>
              <FolderOpen size={18} aria-hidden="true" />
              {output === null ? 'Choose output folder' : 'Change output folder'}
            </Button>
            {output !== null && <p className="min-w-0 break-all text-sm text-muted">{output.location}</p>}
          </div>
          {folderMessage !== null && <Notice>{folderMessage}</Notice>}

          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={convert} disabled={!canConvert}>
              Convert to images
            </Button>
            {output === null && <p className="text-sm text-muted">Choose an output folder to continue.</p>}
          </div>
        </>
      )}

      {runner.message !== null && <Notice>{runner.message}</Notice>}
      {runner.job !== undefined && <JobStatusPanel job={runner.job} />}
    </div>
  )
}
