import {
  ArrowDownUp,
  Combine,
  FileArchive,
  History,
  House,
  RefreshCw,
  ScanText,
  Scissors,
  Settings,
  type LucideIcon,
} from 'lucide-react'

export type FeatureStatus = 'available' | 'in-development'

export interface NavItem {
  id: string
  path: string
  label: string
  summary: string
  icon: LucideIcon
  status: FeatureStatus
}

/**
 * Single source of truth for navigation and feature status.
 * Set a feature to 'available' only when it works end to end.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    id: 'home',
    path: '/',
    label: 'Home',
    summary: 'Start here and pick a tool.',
    icon: House,
    status: 'available',
  },
  {
    id: 'merge',
    path: '/merge',
    label: 'Merge PDF',
    summary: 'Combine several PDFs into one.',
    icon: Combine,
    status: 'available',
  },
  {
    id: 'split',
    path: '/split',
    label: 'Split PDF',
    summary: 'Extract pages or divide a PDF into parts.',
    icon: Scissors,
    status: 'available',
  },
  {
    id: 'convert',
    path: '/convert',
    label: 'Convert Files',
    summary: 'Convert between PDF, images, text and Word documents.',
    icon: RefreshCw,
    status: 'available',
  },
  {
    id: 'organize',
    path: '/organize',
    label: 'Organize PDF',
    summary: 'Reorder, rotate and delete pages.',
    icon: ArrowDownUp,
    status: 'available',
  },
  {
    id: 'compress',
    path: '/compress',
    label: 'Compress PDF',
    summary: 'Make PDF files smaller.',
    icon: FileArchive,
    status: 'available',
  },
  {
    id: 'ocr',
    path: '/ocr',
    label: 'OCR & Text Extraction',
    summary: 'Read the text of scanned documents and images.',
    icon: ScanText,
    status: 'available',
  },
  {
    id: 'recent',
    path: '/recent',
    label: 'Recent Files',
    summary: 'Open results from your earlier jobs.',
    icon: History,
    status: 'available',
  },
  {
    id: 'settings',
    path: '/settings',
    label: 'Settings',
    summary: 'Appearance and application information.',
    icon: Settings,
    status: 'available',
  },
]

/** The six document tools shown as quick-access cards on Home. */
export const TOOL_IDS = ['merge', 'split', 'convert', 'organize', 'compress', 'ocr'] as const

export function findNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => item.path === pathname)
}
