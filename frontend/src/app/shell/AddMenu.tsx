import { ChevronDown, FolderPlus, ListPlus, Plus, Video } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { useDismiss } from '@/hooks/useDismiss'
import { useShell } from './shellContext'

export function AddMenu() {
  const { openAddVideo, openCreatePath } = useShell()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(root, open, close)

  const itemClass =
    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-2'

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-text-primary transition-colors hover:bg-accent-hover"
      >
        <Plus className="size-4" aria-hidden />
        <span className="hidden sm:inline">Add</span>
        <span className="sr-only sm:hidden">Add</span>
        <ChevronDown className="size-4" aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Add"
          className="absolute right-0 z-40 mt-2 w-64 rounded-xl border border-border bg-surface-3 p-1.5 shadow-xl"
        >
          <button
            role="menuitem"
            type="button"
            className={itemClass}
            onClick={() => {
              close()
              openAddVideo()
            }}
          >
            <Video className="size-4 text-text-secondary" aria-hidden />
            Add YouTube Video
          </button>
          <button
            role="menuitem"
            type="button"
            disabled
            aria-disabled="true"
            className={`${itemClass} cursor-not-allowed opacity-60 hover:bg-transparent`}
          >
            <ListPlus className="size-4 text-text-secondary" aria-hidden />
            <span className="flex-1">Import YouTube Playlist</span>
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-text-muted">
              Soon
            </span>
          </button>
          <button
            role="menuitem"
            type="button"
            className={itemClass}
            onClick={() => {
              close()
              openCreatePath()
            }}
          >
            <FolderPlus className="size-4 text-text-secondary" aria-hidden />
            Create Learning Path
          </button>
        </div>
      )}
    </div>
  )
}
