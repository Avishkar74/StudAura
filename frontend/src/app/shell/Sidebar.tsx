import { GraduationCap, Plus } from 'lucide-react'
import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useLearningPaths } from '@/features/learning-paths/queries'
import { MAIN_NAV, PATH_COLORS, SETTINGS_NAV, type NavItem } from './nav'
import { useShell } from './shellContext'

const VISIBLE_PATHS = 5

function itemClass({ isActive }: { isActive: boolean }, collapsed: boolean) {
  return [
    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
    collapsed ? 'justify-center' : '',
    isActive
      ? 'bg-surface-2 text-text-primary ring-1 ring-accent'
      : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary',
  ].join(' ')
}

function SidebarLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem
  collapsed: boolean
  onNavigate: () => void
}) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? item.label : undefined}
      onClick={onNavigate}
      className={(s) => itemClass(s, collapsed)}
    >
      {({ isActive }) => (
        <>
          <Icon className={`size-5 shrink-0 ${isActive ? 'text-accent' : ''}`} aria-hidden />
          {!collapsed && <span className="truncate">{item.label}</span>}
        </>
      )}
    </NavLink>
  )
}

interface SidebarProps {
  /** Icon-only rail (desktop). */
  collapsed: boolean
  /** Called after any navigation so a mobile drawer can close itself. */
  onNavigate: () => void
}

export function Sidebar({ collapsed, onNavigate }: SidebarProps) {
  const { openCreatePath } = useShell()
  const paths = useLearningPaths()
  const [showAll, setShowAll] = useState(false)

  const items = paths.data?.items ?? []
  const visible = showAll ? items : items.slice(0, VISIBLE_PATHS)

  return (
    <nav aria-label="Main" className="flex h-full flex-col gap-1 overflow-y-auto px-3 py-4">
      {MAIN_NAV.map((item) => (
        <SidebarLink key={item.to} item={item} collapsed={collapsed} onNavigate={onNavigate} />
      ))}

      {!collapsed && (
        <section aria-labelledby="my-paths-heading" className="mt-4 border-t border-border pt-4">
          <div className="mb-1 flex items-center justify-between px-3">
            <h2
              id="my-paths-heading"
              className="text-xs font-semibold tracking-wide text-text-muted uppercase"
            >
              My Learning Paths
            </h2>
            <button
              type="button"
              onClick={openCreatePath}
              aria-label="Create learning path"
              className="rounded-md p-1 text-text-secondary hover:bg-surface-2 hover:text-text-primary"
            >
              <Plus className="size-4" aria-hidden />
            </button>
          </div>

          {paths.isPending && (
            <p role="status" className="px-3 py-2 text-sm text-text-muted">
              Loading…
            </p>
          )}
          {paths.isError && (
            <p className="px-3 py-2 text-sm text-text-muted">Couldn&apos;t load your paths.</p>
          )}
          {paths.isSuccess && items.length === 0 && (
            <p className="px-3 py-2 text-sm text-text-muted">No paths yet.</p>
          )}

          <ul className="flex flex-col gap-0.5">
            {visible.map((path, i) => (
              <li key={path.id}>
                <NavLink
                  to={`/learning-paths/${path.id}`}
                  onClick={onNavigate}
                  className={(s) => itemClass(s, false)}
                >
                  <GraduationCap
                    className={`size-5 shrink-0 ${PATH_COLORS[i % PATH_COLORS.length]}`}
                    aria-hidden
                  />
                  <span className="truncate">{path.title}</span>
                </NavLink>
              </li>
            ))}
          </ul>

          {items.length > VISIBLE_PATHS && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              aria-expanded={showAll}
              className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-text-muted hover:bg-surface-2 hover:text-text-primary"
            >
              {showAll ? 'Show less' : 'Show more'}
            </button>
          )}
        </section>
      )}

      <div className="mt-auto border-t border-border pt-4">
        <SidebarLink item={SETTINGS_NAV} collapsed={collapsed} onNavigate={onNavigate} />
      </div>
    </nav>
  )
}
