import { useJobs } from '../../hooks/useJobs'
import { pluralize } from '../../lib/format'

export function StatusBar() {
  const { runningCount } = useJobs()

  return (
    <footer className="flex h-8 shrink-0 items-center justify-between border-t border-border px-8 text-xs text-muted">
      <span aria-live="polite">
        {runningCount === 0 ? 'No jobs running' : `${pluralize(runningCount, 'job')} running`}
      </span>
      <span>Works offline. Documents stay on this computer.</span>
    </footer>
  )
}
