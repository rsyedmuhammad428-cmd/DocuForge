import type { FeatureStatus } from '../../features/registry'

export function StatusBadge({ status }: { status: FeatureStatus }) {
  if (status === 'available') return null
  return (
    <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted">
      In development
    </span>
  )
}
