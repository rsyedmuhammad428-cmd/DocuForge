import { Link } from 'react-router'
import { StatusBadge } from '../../components/common/StatusBadge'
import type { NavItem } from '../registry'

/** Shown for every feature that is not built yet, so nothing looks usable when it is not. */
export function ToolPlaceholderPage({ item }: { item: NavItem }) {
  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <div className="rounded-card border border-border bg-surface p-6">
        <div className="flex items-center gap-3">
          <item.icon size={22} className="text-accent" aria-hidden="true" />
          <h2 className="text-lg font-semibold">{item.label}</h2>
          <StatusBadge status={item.status} />
        </div>
        <p className="mt-3 text-muted">{item.summary}</p>
        <p className="mt-4">This feature is not available yet. It is planned for a later release.</p>
        <Link to="/" className="mt-4 inline-block text-accent hover:text-accent-hover">
          Back to Home
        </Link>
      </div>
    </div>
  )
}
