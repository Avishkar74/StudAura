import { Menu } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { AddMenu } from './AddMenu'
import { ProfileMenu } from './ProfileMenu'
import { SearchBox } from './SearchBox'

interface HeaderProps {
  onToggleSidebar: () => void
  sidebarOpen: boolean
}

export function Header({ onToggleSidebar, sidebarOpen }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-18 shrink-0 items-center gap-3 border-b border-border bg-bg px-3 sm:gap-4 sm:px-5">
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label="Toggle navigation"
        aria-expanded={sidebarOpen}
        aria-controls="app-sidebar"
        className="rounded-lg p-2 text-text-secondary hover:bg-surface-2 hover:text-text-primary"
      >
        <Menu className="size-6" aria-hidden />
      </button>

      <Link to="/" aria-label="StudAura home" className="shrink-0 rounded-lg">
        <Logo compact />
      </Link>

      <div className="flex min-w-0 flex-1 justify-center">
        <SearchBox />
      </div>

      <AddMenu />
      <ProfileMenu />
    </header>
  )
}
