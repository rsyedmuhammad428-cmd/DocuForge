import { useLocation } from 'react-router'
import { findNavItem } from '../../features/registry'
import { ThemeSelector } from '../common/ThemeSelector'

export function TopBar() {
  const { pathname } = useLocation()
  const title = findNavItem(pathname)?.label ?? 'DocuForge'

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-8">
      <h1 className="text-lg font-semibold">{title}</h1>
      <ThemeSelector />
    </header>
  )
}
