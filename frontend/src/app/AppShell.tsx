import { useCallback, useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AddVideoModal } from '@/features/learning-paths/AddVideoModal'
import { CreatePathModal } from '@/features/learning-paths/CreatePathModal'
import { PlaylistImportModal } from '@/features/learning-paths/PlaylistImportModal'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { usePersistentState } from '@/hooks/usePersistentState'
import { Header } from './shell/Header'
import { Sidebar } from './shell/Sidebar'
import { ShellContext, type ShellActions } from './shell/shellContext'

type Dialog =
  | { kind: 'create-path' }
  | { kind: 'add-video'; pathId?: string }
  | { kind: 'import-playlist'; pathId?: string }
  | null

/**
 * Header + sidebar + page outlet.
 * Desktop (lg+): the sidebar is a persistent column that collapses to an icon rail.
 * Smaller screens: it is an off-canvas drawer opened from the header.
 */
export function AppShell() {
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const [collapsed, setCollapsed] = usePersistentState('studaura.sidebar.collapsed', false)
  // The drawer is "open" only for the route + viewport it was opened on, so navigating or
  // resizing to desktop closes it without an effect.
  const [drawerKey, setDrawerKey] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const location = useLocation()
  const viewKey = `${location.pathname}|${isDesktop}`
  const drawerOpen = drawerKey === viewKey
  const setDrawerOpen = useCallback(
    (open: boolean) => setDrawerKey(open ? viewKey : null),
    [viewKey],
  )

  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawerOpen, setDrawerOpen])

  const toggle = useCallback(() => {
    if (isDesktop) setCollapsed((c) => !c)
    else setDrawerOpen(!drawerOpen)
  }, [isDesktop, setCollapsed, drawerOpen, setDrawerOpen])

  const actions = useMemo<ShellActions>(
    () => ({
      openCreatePath: () => setDialog({ kind: 'create-path' }),
      openAddVideo: (pathId) => setDialog({ kind: 'add-video', pathId }),
      openImportPlaylist: (pathId) => setDialog({ kind: 'import-playlist', pathId }),
    }),
    [],
  )

  const railMode = isDesktop && collapsed
  const sidebarOpen = isDesktop ? !collapsed : drawerOpen

  return (
    <ShellContext.Provider value={actions}>
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-accent px-4 py-2 font-semibold text-text-primary focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to main content
      </a>
      <div className="flex h-full flex-col">
        <Header onToggleSidebar={toggle} sidebarOpen={sidebarOpen} />

        <div className="relative flex min-h-0 flex-1">
          {/* Mobile/tablet backdrop */}
          {!isDesktop && drawerOpen && (
            <div
              aria-hidden
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 top-18 z-30 bg-bg/70"
            />
          )}

          <aside
            id="app-sidebar"
            aria-label="Sidebar"
            className={[
              'bg-bg border-border shrink-0 border-r transition-[width,transform] duration-200',
              isDesktop
                ? `${railMode ? 'w-18' : 'w-64'} relative`
                : `fixed top-18 bottom-0 left-0 z-40 w-72 ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}`,
            ].join(' ')}
            // A closed drawer must not be reachable by keyboard or screen reader.
            {...(!isDesktop && !drawerOpen ? { inert: '' } : {})}
          >
            <Sidebar collapsed={railMode} onNavigate={() => setDrawerOpen(false)} />
          </aside>

          <main id="main" tabIndex={-1} className="min-w-0 flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>

      {dialog?.kind === 'create-path' && <CreatePathModal onClose={() => setDialog(null)} />}
      {dialog?.kind === 'import-playlist' && (
        <PlaylistImportModal
          defaultPathId={dialog.pathId}
          onClose={() => setDialog(null)}
          onCreatePath={() => setDialog({ kind: 'create-path' })}
        />
      )}
      {dialog?.kind === 'add-video' && (
        <AddVideoModal
          defaultPathId={dialog.pathId}
          onClose={() => setDialog(null)}
          onCreatePath={() => setDialog({ kind: 'create-path' })}
        />
      )}
    </ShellContext.Provider>
  )
}
