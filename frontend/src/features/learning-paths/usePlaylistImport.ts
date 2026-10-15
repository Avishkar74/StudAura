import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '@/api/client'
import { importPlaylistPage } from '@/api/playlists'
import type { PlaylistImportItem } from '@/api/types'
import { pathKeys } from './queries'

export type ImportPhase = 'idle' | 'running' | 'done' | 'stopped' | 'failed'

export interface ImportState {
  phase: ImportPhase
  added: number
  skipped: number
  /** Videos YouTube would not describe (private or deleted). */
  failedItems: PlaylistImportItem[]
  /** Videos looked at so far (added + skipped + failed). */
  processed: number
  total: number | null
  /** Set when a request failed; the import can be resumed. */
  error: string | null
  /** True once at least one page was imported (so a later error is a partial result). */
  hasProgress: boolean
}

const INITIAL: ImportState = {
  phase: 'idle',
  added: 0,
  skipped: 0,
  failedItems: [],
  processed: 0,
  total: null,
  error: null,
  hasProgress: false,
}

function describe(err: unknown): string {
  if (err instanceof ApiError) return err.message
  return 'Could not reach StudAura. Check your connection and try again.'
}

/**
 * Imports a playlist one page at a time, following `next_page_token`.
 * Every page is saved by the server as it completes, so a failure part-way keeps what was
 * already imported and `resume` continues from the same token.
 */
export function usePlaylistImport() {
  const qc = useQueryClient()
  const [state, setState] = useState<ImportState>(INITIAL)
  const stop = useRef(false)
  const next = useRef<string | undefined>(undefined)
  const input = useRef<{ url: string; pathId: string } | null>(null)

  // Leaving the dialog stops the loop after the page in flight; saved pages stay saved.
  useEffect(() => {
    return () => {
      stop.current = true
    }
  }, [])

  const loop = useCallback(async () => {
    if (!input.current) return
    const { url, pathId } = input.current
    stop.current = false
    setState((s) => ({ ...s, phase: 'running', error: null }))

    try {
      let token = next.current
      do {
        const page = await importPlaylistPage({
          youtube_url: url,
          learning_path_id: pathId,
          page_token: token,
        })
        token = page.next_page_token ?? undefined
        next.current = token
        setState((s) => ({
          ...s,
          added: s.added + page.added,
          skipped: s.skipped + page.skipped,
          failedItems: [...s.failedItems, ...page.items.filter((i) => i.status === 'failed')],
          processed: s.processed + page.items.length,
          total: page.total_in_playlist ?? s.total,
          hasProgress: true,
        }))
      } while (token && !stop.current)
      setState((s) => ({ ...s, phase: token ? 'stopped' : 'done' }))
    } catch (err) {
      setState((s) => ({ ...s, phase: 'failed', error: describe(err) }))
    } finally {
      void qc.invalidateQueries({ queryKey: pathKeys.all })
    }
  }, [qc])

  const start = useCallback(
    (url: string, pathId: string) => {
      input.current = { url, pathId }
      next.current = undefined
      setState(INITIAL)
      void loop()
    },
    [loop],
  )

  const resume = useCallback(() => void loop(), [loop])
  const requestStop = useCallback(() => {
    stop.current = true
  }, [])
  const reset = useCallback(() => {
    next.current = undefined
    setState(INITIAL)
  }, [])

  return { state, start, resume, requestStop, reset }
}
