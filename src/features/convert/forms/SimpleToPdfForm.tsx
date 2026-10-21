import type { FileKind } from '../../../../shared/files'
import { Button } from '../../../components/common/Button'
import { FileSummary } from '../../../components/common/FileSummary'
import { Notice } from '../../../components/common/Notice'
import { JobStatusPanel } from '../../../components/jobs/JobStatusPanel'
import { useJobRunner } from '../../../hooks/useJobRunner'
import { useSingleFile } from '../../../hooks/useSingleFile'
import { bridge } from '../../../lib/bridge'

interface SimpleToPdfFormProps {
  operation: 'text_to_pdf' | 'document_to_pdf'
  kind: Extract<FileKind, 'text' | 'document'>
  chooseLabel: string
  convertLabel: string
  /** If it returns a message for the chosen file, the file cannot be converted and the message is shown. */
  blockedReason?: (file: { name: string }) => string | null
}

/** One input file, one PDF out. Used for text and for Word-style documents. */
export function SimpleToPdfForm({ operation, kind, chooseLabel, convertLabel, blockedReason }: SimpleToPdfFormProps) {
  const source = useSingleFile(kind)
  const runner = useJobRunner()
  const blocked = source.file === null ? null : (blockedReason?.(source.file.ref) ?? null)
  const canConvert = source.usable && !source.busy && !runner.locked && blocked === null

  function convert() {
    const file = source.file
    if (file === null) return
    void runner.start(async () => {
      const output = await bridge.selectOutputFile(`${file.ref.name.replace(/\.[^.]+$/, '')}.pdf`)
      if (output === null) return null
      return { operation, inputId: file.ref.id, outputId: output.id }
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <Button variant="primary" onClick={() => void source.choose()} disabled={source.busy || runner.locked}>
          {source.file === null ? chooseLabel : 'Choose a different file'}
        </Button>
      </div>
      {source.message !== null && <Notice>{source.message}</Notice>}
      {source.file !== null && (
        <FileSummary name={source.file.ref.name} sizeBytes={source.file.ref.sizeBytes} error={source.problem} />
      )}
      {blocked !== null && <Notice>{blocked}</Notice>}
      {source.file !== null && (
        <Button variant="primary" onClick={convert} disabled={!canConvert}>
          {convertLabel}
        </Button>
      )}
      {runner.message !== null && <Notice>{runner.message}</Notice>}
      {runner.job !== undefined && <JobStatusPanel job={runner.job} />}
    </div>
  )
}
