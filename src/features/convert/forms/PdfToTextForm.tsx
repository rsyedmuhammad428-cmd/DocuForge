import { useState } from 'react'
import { parseOptionalPageRanges } from '../../../../shared/page-ranges'
import { Button } from '../../../components/common/Button'
import { FileSummary } from '../../../components/common/FileSummary'
import { Notice } from '../../../components/common/Notice'
import { JobStatusPanel } from '../../../components/jobs/JobStatusPanel'
import { useJobRunner } from '../../../hooks/useJobRunner'
import { useSingleFile } from '../../../hooks/useSingleFile'
import { bridge } from '../../../lib/bridge'

export function PdfToTextForm() {
  const source = useSingleFile('pdf')
  const runner = useJobRunner()
  const [markers, setMarkers] = useState(true)
  const [rangeText, setRangeText] = useState('')

  const parsed = source.pageCount === null ? null : parseOptionalPageRanges(rangeText, source.pageCount)
  const canConvert = source.usable && parsed?.ok === true && !source.busy && !runner.locked

  function convert() {
    const file = source.file
    if (file === null || parsed === null || !parsed.ok) return
    void runner.start(async () => {
      const output = await bridge.selectOutputFile(`${file.ref.name.replace(/\.pdf$/i, '')}.txt`, 'text')
      if (output === null) return null
      return {
        operation: 'pdf_to_text',
        inputId: file.ref.id,
        outputId: output.id,
        pageMarkers: markers,
        ranges: parsed.ranges,
      }
    })
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
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={markers}
              onChange={(event) => setMarkers(event.target.checked)}
              disabled={runner.locked}
              className="accent-accent"
            />
            <span>Add a "Page N" line before each page</span>
          </label>

          <div className="space-y-1">
            <label htmlFor="text-pages" className="block font-medium">
              Pages (optional)
            </label>
            <input
              id="text-pages"
              type="text"
              value={rangeText}
              onChange={(event) => setRangeText(event.target.value)}
              placeholder="Leave empty for every page, or type 1-3, 5"
              aria-invalid={parsed !== null && !parsed.ok}
              aria-describedby="text-pages-help"
              disabled={runner.locked}
              className="w-full rounded-control border border-border bg-surface px-3 py-2"
            />
            <p id="text-pages-help" className="text-sm" role={parsed !== null && !parsed.ok ? 'alert' : undefined}>
              {parsed !== null && !parsed.ok ? parsed.error : 'The text file is saved as UTF-8.'}
            </p>
          </div>

          <Button variant="primary" onClick={convert} disabled={!canConvert}>
            Extract text
          </Button>
        </>
      )}

      {runner.message !== null && <Notice>{runner.message}</Notice>}
      {runner.job !== undefined && <JobStatusPanel job={runner.job} />}
    </div>
  )
}
