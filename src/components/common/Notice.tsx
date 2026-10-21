import { CircleAlert } from 'lucide-react'
import type { ReactNode } from 'react'

/** An error or warning. The icon and wording carry the meaning, not color alone. */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-control border border-border bg-surface p-3 text-sm"
    >
      <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
