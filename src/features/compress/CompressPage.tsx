import { Button } from '../../components/common/Button'
import { FileSummary } from '../../components/common/FileSummary'
import { Notice } from '../../components/common/Notice'
import { JobStatusPanel } from '../../components/jobs/JobStatusPanel'
import { useJobRunner } from '../../hooks/useJobRunner'
import { useSingleFile } from '../../hooks/useSingleFile'
import { bridge } from '../../lib/bridge'
import { useState } from 'react'
import type { CompressionPreset } from '../../../shared/jobs'

const PRESETS: readonly { value: CompressionPreset; label: string; lossy: boolean; description: string }[] = [
  {
    value: 'light',
    label: 'Light',
    lossy: false,
    description: 'Cleans up and repacks the file. Pictures are not changed. Usually saves a little.',
  },
  {
    value: 'balanced',
    label: 'Balanced',
    lossy: true,
    description: 'Reduces pictures sharper than 170 dpi to 150 dpi. Good for email and screens.',
  },
  {
    value: 'smallest',
    label: 'Smallest',
    lossy: true,
    description: 'Reduces pictures sharper than 120 dpi to 96 dpi with stronger compression. Pictures look softer.',
  },
]

export function CompressPage() {
  const source = useSingleFile('pdf')
  const runner = useJobRunner()
  const [preset, setPreset] = useState<CompressionPreset>('balanced')

  const canCompress = source.usable && !source.busy && !runner.locked

  function compress() {
    const file = source.file
    if (file === null) return
    void runner.start(async () => {
      const output = await bridge.selectOutputFile(`${file.ref.name.replace(/\.pdf$/i, '')}_compressed.pdf`)
      if (output === null) return null
      return { operation: 'compress', inputId: file.ref.id, outputId: output.id, preset }
    })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-8 py-8">
      <p className="max-w-prose text-muted">
        Make a PDF smaller. Text and drawings are never changed; only pictures can be reduced. Your
        original is never changed, and the result is saved as a new file.
      </p>

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
          <fieldset className="space-y-2" disabled={runner.locked}>
            <legend className="mb-1 text-base font-semibold">How much to compress</legend>
            {PRESETS.map((option) => (
              <label
                key={option.value}
                className="flex cursor-pointer items-start gap-3 rounded-card border border-border bg-surface p-3 has-checked:border-accent has-focus-visible:outline-2 has-focus-visible:outline-accent"
              >
                <input
                  type="radio"
                  name="compression-preset"
                  value={option.value}
                  checked={preset === option.value}
                  onChange={() => setPreset(option.value)}
                  className="mt-1 accent-accent"
                />
                <span>
                  <span className="block font-medium">
                    {option.label}
                    <span className="ml-2 text-sm font-normal text-muted">
                      {option.lossy ? 'Changes picture quality' : 'No quality loss'}
                    </span>
                  </span>
                  <span className="block text-sm text-muted">{option.description}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="space-y-2">
            <Button variant="primary" onClick={compress} disabled={!canCompress}>
              Compress PDF
            </Button>
            <p className="text-sm text-muted">
              If the PDF is already compact, DocuForge says so instead of saving a file that is no
              smaller.
            </p>
          </div>
        </>
      )}

      {runner.message !== null && <Notice>{runner.message}</Notice>}
      {runner.job !== undefined && <JobStatusPanel job={runner.job} />}
    </div>
  )
}
