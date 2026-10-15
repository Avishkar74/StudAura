/**
 * Local backup of note text that has not been saved yet, so nothing is lost if a save keeps
 * failing, the tab closes, or the student navigates away mid-edit (CLAUDE.md rule 9).
 * Keyed by user and video. Storage can throw (private mode, quota), so every call is guarded.
 */

export interface Draft {
  body: string
  /** The server revision the draft was based on. */
  baseRevision: number
  savedAt: string
}

const key = (userId: string, videoId: string) => `studaura.note-draft.${userId}.${videoId}`

export function saveDraft(userId: string, videoId: string, draft: Draft): void {
  try {
    window.localStorage.setItem(key(userId, videoId), JSON.stringify(draft))
  } catch {
    /* the in-memory copy is still there */
  }
}

export function loadDraft(userId: string, videoId: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(key(userId, videoId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Draft>
    if (typeof parsed.body !== 'string' || typeof parsed.baseRevision !== 'number') return null
    return { body: parsed.body, baseRevision: parsed.baseRevision, savedAt: parsed.savedAt ?? '' }
  } catch {
    return null
  }
}

export function clearDraft(userId: string, videoId: string): void {
  try {
    window.localStorage.removeItem(key(userId, videoId))
  } catch {
    /* nothing to do */
  }
}
