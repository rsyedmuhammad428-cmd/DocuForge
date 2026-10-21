import { formatBytes, pluralize } from '../../lib/format'

interface FileSummaryProps {
  name: string
  sizeBytes: number
  checking?: boolean
  pageCount?: number | null
  error?: string | null
}

/** The file the user picked: name, size, page count when known, and any problem with it. */
export function FileSummary({ name, sizeBytes, checking = false, pageCount = null, error = null }: FileSummaryProps) {
  return (
    <section aria-label="Selected file" className="rounded-card border border-border bg-surface p-4">
      <p className="font-medium">{name}</p>
      <p className="text-sm text-muted">
        {formatBytes(sizeBytes)}
        {checking && ' · Checking…'}
        {pageCount !== null && ` · ${pluralize(pageCount, 'page')}`}
      </p>
      {error !== null && (
        <p role="alert" className="mt-2 text-sm">
          {error}
        </p>
      )}
    </section>
  )
}
