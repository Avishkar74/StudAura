import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import { putNote } from '@/api/notes'
import type { Note } from '@/api/types'
import { loadDraft } from './drafts'
import { DEBOUNCE_MS, useNoteAutosave } from './useNoteAutosave'

vi.mock('@/api/notes', () => ({ putNote: vi.fn() }))
const put = vi.mocked(putNote)

const INITIAL: Note = { video_id: 'v1', body: '<p>start</p>', revision: 3, updated_at: null }

function note(body: string, revision: number): Note {
  return { video_id: 'v1', body, revision, updated_at: '2026-10-15T12:00:00Z' }
}

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function setup(initial: Note = INITIAL) {
  const hook = renderHook(() => useNoteAutosave({ videoId: 'v1', userId: 'u1', initial }))
  act(() => hook.result.current.markLoaded(initial.body))
  return hook
}

const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))
const lastCall = () => put.mock.calls.at(-1)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-15T12:00:00Z'))
  put.mockReset()
})
afterEach(() => vi.useRealTimers())

describe('debounced autosave', () => {
  it('waits for a pause in typing, then saves with the revision it was based on', async () => {
    put.mockResolvedValue(note('<p>hello</p>', 4))
    const { result } = setup()

    act(() => result.current.onChange('<p>hello</p>'))
    expect(result.current.state).toBe('dirty')
    await advance(DEBOUNCE_MS - 1)
    expect(put).not.toHaveBeenCalled()

    await advance(1)
    expect(put).toHaveBeenCalledTimes(1)
    expect(put).toHaveBeenCalledWith(
      'v1',
      { body: '<p>hello</p>', base_revision: 3 },
      { keepalive: false },
    )
    expect(result.current.state).toBe('saved')
    expect(result.current.lastSavedAt).toEqual(new Date('2026-10-15T12:00:00Z'))
  })

  it('restarts the wait on every keystroke and saves only the latest text', async () => {
    put.mockResolvedValue(note('<p>abc</p>', 4))
    const { result } = setup()

    act(() => result.current.onChange('<p>a</p>'))
    await advance(1000)
    act(() => result.current.onChange('<p>ab</p>'))
    await advance(1000)
    act(() => result.current.onChange('<p>abc</p>'))
    await advance(DEBOUNCE_MS)

    expect(put).toHaveBeenCalledTimes(1)
    expect(lastCall()?.[1]).toEqual({ body: '<p>abc</p>', base_revision: 3 })
  })

  it('does nothing when the text is edited back to what is already saved', async () => {
    const { result } = setup()
    act(() => result.current.onChange('<p>changed</p>'))
    act(() => result.current.onChange(INITIAL.body))
    await advance(DEBOUNCE_MS * 2)
    expect(put).not.toHaveBeenCalled()
    expect(result.current.state).toBe('saved')
  })

  it("does not report a change for the editor's own re-serialisation of loaded content", async () => {
    const { result } = setup()
    act(() => result.current.markLoaded('<ul><li><p>start</p></li></ul>'))
    act(() => result.current.onChange('<ul><li><p>start</p></li></ul>'))
    await advance(DEBOUNCE_MS * 2)
    expect(put).not.toHaveBeenCalled()
  })

  it('sends one save at a time and saves what was typed meanwhile straight after', async () => {
    const first = deferred<Note>()
    put.mockReturnValueOnce(first.promise)
    put.mockResolvedValueOnce(note('<p>one two</p>', 5))
    const { result } = setup()

    act(() => result.current.onChange('<p>one</p>'))
    await advance(DEBOUNCE_MS) // the first save is now in flight
    expect(result.current.state).toBe('saving')

    act(() => result.current.onChange('<p>one two</p>'))
    await advance(DEBOUNCE_MS * 2)
    expect(put).toHaveBeenCalledTimes(1) // still only the first request

    await act(async () => first.resolve(note('<p>one</p>', 4)))
    await advance(0)
    expect(put).toHaveBeenCalledTimes(2)
    // The follow-up is based on the revision the first save returned.
    expect(lastCall()?.[1]).toEqual({ body: '<p>one two</p>', base_revision: 4 })
    expect(result.current.state).toBe('saved')
  })
})

describe('when a save fails', () => {
  it('keeps the text, offers retry, and keeps a local backup', async () => {
    put.mockRejectedValueOnce(new TypeError('network down'))
    const { result } = setup()

    act(() => result.current.onChange('<p>precious text</p>'))
    await advance(DEBOUNCE_MS)

    expect(result.current.state).toBe('error')
    expect(result.current.errorMessage).toMatch(/Couldn't save your note/)
    expect(loadDraft('u1', 'v1')).toMatchObject({ body: '<p>precious text</p>', baseRevision: 3 })
  })

  it('retry sends the same text and clears the backup once it works', async () => {
    put.mockRejectedValueOnce(new TypeError('network down'))
    put.mockResolvedValueOnce(note('<p>precious text</p>', 4))
    const { result } = setup()
    act(() => result.current.onChange('<p>precious text</p>'))
    await advance(DEBOUNCE_MS)
    expect(result.current.state).toBe('error')

    await act(async () => result.current.retry())
    expect(put).toHaveBeenCalledTimes(2)
    expect(lastCall()?.[1]).toEqual({ body: '<p>precious text</p>', base_revision: 3 })
    expect(result.current.state).toBe('saved')
    expect(loadDraft('u1', 'v1')).toBeNull()
  })

  it('tries again by itself when the student keeps typing', async () => {
    put.mockRejectedValueOnce(new TypeError('network down'))
    put.mockResolvedValueOnce(note('<p>more text</p>', 4))
    const { result } = setup()
    act(() => result.current.onChange('<p>text</p>'))
    await advance(DEBOUNCE_MS)
    expect(result.current.state).toBe('error')

    act(() => result.current.onChange('<p>more text</p>'))
    expect(result.current.state).toBe('dirty')
    await advance(DEBOUNCE_MS)
    expect(result.current.state).toBe('saved')
  })

  it('explains when the note is too long', async () => {
    put.mockRejectedValueOnce(
      new ApiError(422, 'NOTE_TOO_LARGE', 'This note is too long to save (the limit is 100 KB).'),
    )
    const { result } = setup()
    act(() => result.current.onChange('<p>huge</p>'))
    await advance(DEBOUNCE_MS)
    expect(result.current.state).toBe('error')
    expect(result.current.errorMessage).toContain('100 KB')
  })
})

describe('when the note changed somewhere else (409)', () => {
  function conflictError() {
    return new ApiError(409, 'NOTE_CONFLICT', 'changed', [
      { current: note('<p>from another tab</p>', 9) },
    ])
  }

  it('stops, keeps the text, and exposes the other version without overwriting', async () => {
    put.mockRejectedValueOnce(conflictError())
    const { result } = setup()
    act(() => result.current.onChange('<p>mine</p>'))
    await advance(DEBOUNCE_MS)

    expect(result.current.state).toBe('conflict')
    expect(result.current.conflict?.body).toBe('<p>from another tab</p>')

    // Further typing is held back until the student decides.
    act(() => result.current.onChange('<p>mine, more</p>'))
    await advance(DEBOUNCE_MS * 3)
    expect(put).toHaveBeenCalledTimes(1)
    expect(result.current.state).toBe('conflict')
  })

  it('"keep mine" saves my text on top of the newer revision', async () => {
    put.mockRejectedValueOnce(conflictError())
    put.mockResolvedValueOnce(note('<p>mine, more</p>', 10))
    const { result } = setup()
    act(() => result.current.onChange('<p>mine</p>'))
    await advance(DEBOUNCE_MS)
    act(() => result.current.onChange('<p>mine, more</p>'))

    await act(async () => result.current.keepMine())
    expect(lastCall()?.[1]).toEqual({ body: '<p>mine, more</p>', base_revision: 9 })
    expect(result.current.state).toBe('saved')
    expect(result.current.conflict).toBeNull()
  })

  it('"use the saved version" adopts the other text and discards my backup', async () => {
    put.mockRejectedValueOnce(conflictError())
    const { result } = setup()
    act(() => result.current.onChange('<p>mine</p>'))
    await advance(DEBOUNCE_MS)
    expect(loadDraft('u1', 'v1')).not.toBeNull()

    let adopted = ''
    act(() => {
      adopted = result.current.adoptSaved()
    })
    expect(adopted).toBe('<p>from another tab</p>')
    expect(result.current.state).toBe('saved')
    expect(loadDraft('u1', 'v1')).toBeNull()

    // After adopting, further edits are based on the other tab's revision.
    put.mockResolvedValueOnce(note('<p>next</p>', 10))
    act(() => result.current.onChange('<p>next</p>'))
    await advance(DEBOUNCE_MS)
    expect(lastCall()?.[1]).toEqual({ body: '<p>next</p>', base_revision: 9 })
  })
})

describe('never losing text', () => {
  it('backs up unsaved text locally while the save is pending', async () => {
    put.mockReturnValue(deferred<Note>().promise) // never completes
    const { result } = setup()
    act(() => result.current.onChange('<p>typing</p>'))
    await advance(400)
    expect(loadDraft('u1', 'v1')).toMatchObject({ body: '<p>typing</p>', baseRevision: 3 })
  })

  it('clears the local backup after a successful save', async () => {
    put.mockResolvedValue(note('<p>x</p>', 4))
    const { result } = setup()
    act(() => result.current.onChange('<p>x</p>'))
    await advance(DEBOUNCE_MS)
    expect(loadDraft('u1', 'v1')).toBeNull()
  })

  it('saves right away, with keepalive, when the student navigates away', async () => {
    put.mockResolvedValue(note('<p>leaving</p>', 4))
    const { result, unmount } = setup()
    act(() => result.current.onChange('<p>leaving</p>'))
    unmount() // before the debounce fires

    expect(put).toHaveBeenCalledTimes(1)
    expect(lastCall()).toEqual([
      'v1',
      { body: '<p>leaving</p>', base_revision: 3 },
      { keepalive: true },
    ])
    expect(loadDraft('u1', 'v1')).toMatchObject({ body: '<p>leaving</p>' })
  })

  it('saves when the tab is closed or hidden', async () => {
    put.mockResolvedValue(note('<p>closing</p>', 4))
    const { result } = setup()
    act(() => result.current.onChange('<p>closing</p>'))
    window.dispatchEvent(new Event('pagehide'))
    expect(lastCall()?.[2]).toEqual({ keepalive: true })
  })

  it('warns before the tab closes while anything is unsaved, and not otherwise', async () => {
    put.mockResolvedValue(note('<p>a</p>', 4))
    const { result } = setup()
    const closing = () => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event.defaultPrevented
    }

    expect(closing()).toBe(false) // nothing to lose
    act(() => result.current.onChange('<p>a</p>'))
    expect(closing()).toBe(true) // unsaved
    await advance(DEBOUNCE_MS)
    expect(closing()).toBe(false) // saved
  })

  it('still warns while a save has failed', async () => {
    put.mockRejectedValue(new TypeError('offline'))
    const { result } = setup()
    act(() => result.current.onChange('<p>a</p>'))
    await advance(DEBOUNCE_MS)
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('does not break when local storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    put.mockRejectedValueOnce(new TypeError('offline'))
    const { result } = setup()
    act(() => result.current.onChange('<p>a</p>'))
    await advance(DEBOUNCE_MS)
    expect(result.current.state).toBe('error') // the text is still in memory; retry works
  })
})
