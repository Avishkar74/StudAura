import { useId, useRef, type KeyboardEvent } from 'react'
import { CommentsPanel } from '@/features/comments/CommentsPanel'
import { NotesPanel } from '@/features/notes/NotesPanel'
import { usePersistentState } from '@/hooks/usePersistentState'

const TABS = ['Notes', 'Comments', 'Progress'] as const
type Tab = (typeof TABS)[number]

function ComingSoon({ what }: { what: string }) {
  return <p className="text-sm text-text-secondary">{what} are coming soon.</p>
}

/** Right-hand workspace panel (PRD 6.5). The selected tab lasts for the browser session. */
export function WorkspacePanel({
  videoId,
  getCurrentTime = () => null,
  onSeek,
}: {
  videoId: string
  getCurrentTime?: () => number | null
  onSeek?: (seconds: number) => void
}) {
  const [tab, setTab] = usePersistentState<Tab>('studaura.workspace.tab', 'Notes', 'session')
  const base = useId()
  const buttons = useRef<(HTMLButtonElement | null)[]>([])

  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  function onKeyDown(e: KeyboardEvent, index: number) {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = (index + step + TABS.length) % TABS.length
    setTab(TABS[next])
    buttons.current[next]?.focus()
  }

  return (
    <aside
      aria-label="Notes and progress"
      className="flex min-h-96 flex-col rounded-xl border border-border bg-surface-1 p-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-7rem)]"
    >
      <div
        role="tablist"
        aria-label="Workspace panel"
        className="mb-3 flex gap-1 border-b border-border"
      >
        {TABS.map((name, i) => (
          <button
            key={name}
            ref={(el) => {
              buttons.current[i] = el
            }}
            role="tab"
            id={`${base}-tab-${name}`}
            aria-selected={tab === name}
            aria-controls={`${base}-panel-${name}`}
            tabIndex={tab === name ? 0 : -1}
            onClick={() => setTab(name)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === name
                ? 'border-accent text-text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`${base}-panel-${tab}`}
        aria-labelledby={`${base}-tab-${tab}`}
        className="flex min-h-0 flex-1 flex-col"
      >
        {tab === 'Notes' && <NotesPanel videoId={videoId} />}
        {tab === 'Comments' && (
          <CommentsPanel videoId={videoId} getCurrentTime={getCurrentTime} onSeek={onSeek} />
        )}
        {tab === 'Progress' && <ComingSoon what="Path progress details" />}
      </div>
    </aside>
  )
}
