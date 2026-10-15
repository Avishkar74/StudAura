import {
  BookOpen,
  House,
  ListVideo,
  Notebook,
  RotateCcw,
  Settings,
  Target,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** `end` makes "/" match only the dashboard, not every route. */
  end?: boolean
}

export const MAIN_NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/learning-paths', label: 'All Learning Paths', icon: ListVideo, end: true },
  { to: '/goals', label: 'Daily Goals', icon: Target },
  { to: '/revision', label: 'Needs Revision', icon: RotateCcw },
  { to: '/notes', label: 'My Notes', icon: Notebook },
  { to: '/library', label: 'Saved Videos', icon: BookOpen },
]

export const SETTINGS_NAV: NavItem = { to: '/settings', label: 'Settings', icon: Settings }

/** Learning paths get a stable accent from the design tokens, by position. */
export const PATH_COLORS = [
  'text-accent',
  'text-info',
  'text-success',
  'text-revision',
  'text-warning',
] as const
