import { Files } from 'lucide-react'
import { NavLink } from 'react-router'
import { NAV_ITEMS } from '../../features/registry'

export function Sidebar() {
  return (
    <nav aria-label="Main" className="flex w-60 shrink-0 flex-col border-r border-border px-2 py-3">
      <div className="mb-3 flex items-center gap-2 px-3 py-2">
        <Files size={20} className="text-accent" aria-hidden="true" />
        <span className="text-base font-semibold">DocuForge</span>
      </div>

      <ul className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => (
          <li key={item.id}>
            <NavLink
              to={item.path}
              end
              className={({ isActive }) =>
                [
                  'relative flex items-center gap-3 rounded-control px-3 py-2',
                  isActive
                    ? "bg-subtle before:absolute before:top-2 before:bottom-2 before:left-0 before:w-[3px] before:rounded-full before:bg-accent before:content-['']"
                    : 'hover:bg-surface-hover',
                ].join(' ')
              }
            >
              <item.icon size={18} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.status === 'in-development' && (
                <span className="text-xs text-muted" title="In development">
                  Soon
                </span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
