import { LogOut, Settings } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/features/auth/useAuth'
import { useMe } from '@/features/auth/queries'
import { useDismiss } from '@/hooks/useDismiss'

export function ProfileMenu() {
  const { signOut, user } = useAuth()
  const me = useMe()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(root, open, close)

  const email = me.data?.email ?? user?.email ?? ''
  const name = me.data?.display_name || email.split('@')[0] || 'Account'
  const initial = name.charAt(0).toUpperCase()

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((v) => !v)}
        className="flex size-10 items-center justify-center rounded-full bg-surface-3 text-sm font-semibold text-text-primary ring-1 ring-border hover:ring-text-muted"
      >
        {initial}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 z-40 mt-2 w-64 rounded-xl border border-border bg-surface-3 p-1.5 shadow-xl"
        >
          <div className="border-b border-border px-3 py-2">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="truncate text-xs text-text-secondary">{email}</p>
          </div>
          <Link
            role="menuitem"
            to="/settings"
            onClick={close}
            className="mt-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-surface-2"
          >
            <Settings className="size-4 text-text-secondary" aria-hidden />
            Settings
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              close()
              void signOut()
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2"
          >
            <LogOut className="size-4 text-text-secondary" aria-hidden />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
