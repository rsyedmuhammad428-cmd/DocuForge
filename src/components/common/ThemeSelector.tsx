import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'
import { useId } from 'react'
import type { ThemePreference } from '../../../shared/settings'
import { useSettings } from '../../hooks/useSettings'

const OPTIONS: readonly { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

/** Native radio buttons give arrow-key navigation and screen reader support for free. */
export function ThemeSelector({ showLabels = false }: { showLabels?: boolean }) {
  const { state, setTheme } = useSettings()
  const groupName = useId()
  const current = state.status === 'ready' ? state.settings.theme : undefined
  const disabled = state.status !== 'ready'

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="inline-flex rounded-control border border-border bg-surface p-0.5"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <label
          key={value}
          title={`${label} theme`}
          className="flex cursor-pointer items-center gap-1.5 rounded-[3px] px-2.5 py-1.5 text-muted has-checked:bg-subtle has-checked:text-fg has-focus-visible:outline-2 has-focus-visible:outline-accent has-disabled:cursor-not-allowed has-disabled:opacity-50"
        >
          <input
            type="radio"
            name={groupName}
            value={value}
            checked={current === value}
            disabled={disabled}
            onChange={() => void setTheme(value)}
            className="sr-only"
          />
          <Icon size={16} aria-hidden="true" />
          {showLabels ? <span>{label}</span> : <span className="sr-only">{label}</span>}
        </label>
      ))}
    </div>
  )
}
