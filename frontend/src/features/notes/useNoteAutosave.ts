import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '@/api/client'
import { putNote } from '@/api/notes'
import type { Note } from '@/api/types'
import { clearDraft, saveDraft } from './drafts'

/** Wait this long after the last keystroke before saving (CLAUDE.md: debounce 1.5 s). */
export const DEBOUNCE_MS = 1500
/** Draft backups are cheap but notes can be large; do not write on every keystroke. */
const DRAFT_DEBOUNCE_MS = 300

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict'

interface Options {
  videoId: string
  userId: string
  /** The saved note as loaded from the server. */
  initial: Note
  /** Quiet time after the last edit before saving. Only tests change this. */
  debounceMs?: number
}

/**
 * Autosave for one note.
 *
 * - Debounced (1.5 s). One save in flight at a time; edits made meanwhile are saved right after.
 * - The text always stays in memory: a failed save keeps it, shows an error with Retry, and a
 *   local draft backup survives navigation and tab closes.
 * - Each save sends the revision it is based on. If the note changed elsewhere the server refuses
 *   with 409 and the student chooses what to keep; nothing is overwritten silently.
 */
export function useNoteAutosave({ videoId, userId, initial, debounceMs = DEBOUNCE_MS }: Options) {
  const [state, setState] = useState<SaveState>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(
    initial.updated_at ? new Date(initial.updated_at) : null,
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [conflict, setConflict] = useState<Note | null>(null)

  const latest = useRef('') // what the editor currently holds
  const saved = useRef('') // what the server is known to hold, in editor form
  const revision = useRef(initial.revision)
  const inFlight = useRef(false)
  const debounce = useRef<number | undefined>(undefined)
  const draftTimer = useRef<number | undefined>(undefined)
  const stateRef = useRef<SaveState>('idle')
  const mounted = useRef(true)

  const update = useCallback((next: SaveState) => {
    stateRef.current = next
    if (mounted.current) setState(next)
  }, [])

  const writeDraft = useCallback(() => {
    window.clearTimeout(draftTimer.current)
    draftTimer.current = undefined
    if (latest.current !== saved.current) {
      saveDraft(userId, videoId, {
        body: latest.current,
        baseRevision: revision.current,
        savedAt: new Date().toISOString(),
      })
    }
  }, [userId, videoId])

  const save = useCallback(
    async function run(keepalive = false): Promise<void> {
      window.clearTimeout(debounce.current)
      debounce.current = undefined
      if (inFlight.current) return // the running save re-checks `latest` when it finishes
      if (latest.current === saved.current) {
        if (stateRef.current !== 'conflict') update('saved')
        return
      }

      const snapshot = latest.current
      inFlight.current = true
      update('saving')
      try {
        const note = await putNote(
          videoId,
          { body: snapshot, base_revision: revision.current },
          { keepalive },
        )
        revision.current = note.revision
        saved.current = snapshot
        if (mounted.current) {
          setLastSavedAt(note.updated_at ? new Date(note.updated_at) : new Date())
          setErrorMessage(null)
        }
        inFlight.current = false
        if (latest.current !== snapshot) {
          // More was typed while this save was running: save that too.
          update('dirty')
          void run()
        } else {
          clearDraft(userId, videoId)
          update('saved')
        }
      } catch (err) {
        inFlight.current = false
        writeDraft()
        if (err instanceof ApiError && err.status === 409) {
          const current = (err.details[0] as { current?: Note } | undefined)?.current
          if (mounted.current && current) setConflict(current)
          update('conflict')
        } else {
          if (mounted.current) {
            setErrorMessage(
              err instanceof ApiError && err.code === 'NOTE_TOO_LARGE'
                ? err.message
                : "Couldn't save your note. Your text is kept; check your connection and retry.",
            )
          }
          update('error')
        }
      }
    },
    [videoId, userId, update, writeDraft],
  )

  /** Call with the editor's current content (normalised) on every change. */
  const onChange = useCallback(
    (html: string) => {
      latest.current = html
      if (html === saved.current && !inFlight.current) {
        window.clearTimeout(debounce.current)
        clearDraft(userId, videoId)
        if (stateRef.current !== 'conflict') update('saved')
        return
      }
      window.clearTimeout(draftTimer.current)
      draftTimer.current = window.setTimeout(writeDraft, DRAFT_DEBOUNCE_MS)
      // While a conflict is unresolved nothing is sent; the student decides first.
      if (stateRef.current === 'conflict') return
      update('dirty')
      window.clearTimeout(debounce.current)
      debounce.current = window.setTimeout(() => void save(), debounceMs)
    },
    [save, update, userId, videoId, writeDraft, debounceMs],
  )

  /**
   * The editor has loaded content. Its serialisation can differ slightly from the server's
   * (e.g. wrapping list items), so adopt it as the baseline instead of reporting a phantom edit.
   */
  const markLoaded = useCallback((html: string) => {
    saved.current = html
    latest.current = html
  }, [])

  const retry = useCallback(() => void save(), [save])

  /** Conflict: keep my text and overwrite the newer saved note (on top of its revision). */
  const keepMine = useCallback(() => {
    if (conflict) revision.current = conflict.revision
    setConflict(null)
    update('dirty')
    void save()
  }, [conflict, save, update])

  /** Conflict: drop my text and adopt the saved note. Returns its body for the editor to show. */
  const adoptSaved = useCallback((): string => {
    const note = conflict
    if (!note) return latest.current
    revision.current = note.revision
    saved.current = note.body
    latest.current = note.body
    clearDraft(userId, videoId)
    setConflict(null)
    setLastSavedAt(note.updated_at ? new Date(note.updated_at) : new Date())
    update('saved')
    return note.body
  }, [conflict, update, userId, videoId])

  /** A restored draft or other external edit that should be saved like typing. */
  const flushNow = useCallback(() => void save(), [save])

  // Warn before closing the tab while anything is unsaved.
  useEffect(() => {
    if (state !== 'dirty' && state !== 'saving' && state !== 'error' && state !== 'conflict') return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [state])

  // Save as soon as the tab is hidden or closed, and keep a local copy of anything unsaved.
  useEffect(() => {
    mounted.current = true
    const leave = () => {
      writeDraft()
      if (stateRef.current === 'dirty' || stateRef.current === 'error') void save(true)
    }
    const onVisibility = () => document.visibilityState === 'hidden' && leave()
    window.addEventListener('pagehide', leave)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', leave)
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearTimeout(debounce.current)
      // Navigating away: back up the text, then try to save it. If that save fails the draft
      // is still on this device and is offered back the next time the note opens.
      leave()
      mounted.current = false
    }
  }, [save, writeDraft])

  return {
    state,
    lastSavedAt,
    errorMessage,
    conflict,
    onChange,
    markLoaded,
    retry,
    keepMine,
    adoptSaved,
    flushNow,
  }
}
