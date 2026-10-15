import { Trash2 } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { ApiError } from '@/api/client'
import { Button } from '@/components/Button'
import { formatRelative, formatTimestamp } from '@/lib/time'
import { useAddComment, useComments, useDeleteComment } from './queries'

export const MAX_COMMENT_CHARS = 2000

interface CommentsPanelProps {
  videoId: string
  /** The player's current time in seconds, or null when there is no player. */
  getCurrentTime: () => number | null
  /** Jump the player to a comment's timestamp. */
  onSeek?: (seconds: number) => void
}

/** Personal comments on one video, each with an optional timestamp (PRD 6.5, AC-07). */
export function CommentsPanel({ videoId, getCurrentTime, onSeek }: CommentsPanelProps) {
  const list = useComments(videoId)
  const add = useAddComment(videoId)
  const remove = useDeleteComment(videoId)
  const [text, setText] = useState('')
  const [stamp, setStamp] = useState<number | null>(null)
  const field = useId()

  const trimmed = text.trim()
  const canSend = trimmed.length > 0 && text.length <= MAX_COMMENT_CHARS && !add.isPending

  function toggleStamp(on: boolean) {
    setStamp(on ? Math.floor(getCurrentTime() ?? 0) : null)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!canSend) return
    // The text stays in the box until the server has accepted it, so a failure loses nothing.
    add.mutate(
      { body: trimmed, timestamp_seconds: stamp },
      {
        onSuccess: () => {
          setText('')
          setStamp(null)
        },
      },
    )
  }

  const addError = add.error
    ? add.error instanceof ApiError && add.error.status === 422
      ? add.error.message
      : "Couldn't save your comment. Check your connection and try again."
    : null

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <form onSubmit={submit} className="flex flex-col gap-2">
        <label htmlFor={field} className="text-sm font-medium text-text-secondary">
          Add a comment
        </label>
        <textarea
          id={field}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          className="resize-y rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
          placeholder="A question, a reminder, something to revisit…"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={stamp !== null}
              onChange={(e) => toggleStamp(e.target.checked)}
            />
            {stamp !== null ? `At ${formatTimestamp(stamp)}` : 'Attach the current video time'}
          </label>
          <div className="flex items-center gap-3">
            {text.length > MAX_COMMENT_CHARS * 0.9 && (
              <span
                className={`text-xs ${text.length > MAX_COMMENT_CHARS ? 'text-warning' : 'text-text-muted'}`}
              >
                {text.length}/{MAX_COMMENT_CHARS}
              </span>
            )}
            <Button type="submit" disabled={!canSend}>
              {add.isPending ? 'Adding…' : 'Add comment'}
            </Button>
          </div>
        </div>
        {addError && (
          <p role="alert" className="text-sm text-warning">
            {addError}
          </p>
        )}
      </form>

      {remove.isError && (
        <p role="alert" className="text-sm text-warning">
          Couldn&apos;t delete that comment. Try again.
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {list.isPending ? (
          <p className="text-sm text-text-secondary">Loading comments…</p>
        ) : list.isError ? (
          <div role="alert" className="flex flex-col items-start gap-2 text-sm">
            <p className="text-warning">Couldn&apos;t load your comments.</p>
            <Button variant="secondary" onClick={() => void list.refetch()}>
              Try again
            </Button>
          </div>
        ) : list.data.length === 0 ? (
          <p className="text-sm text-text-secondary">
            No comments yet. Add one to remember a moment or question.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.data.map((c) => (
              <li key={c.id} className="rounded-lg border border-border bg-surface-2 p-3 text-sm">
                <p className="whitespace-pre-wrap break-words">{c.body}</p>
                <div className="mt-2 flex items-center justify-between gap-2 text-xs text-text-muted">
                  <span className="flex items-center gap-2">
                    {c.timestamp_seconds !== null &&
                      (onSeek ? (
                        <button
                          type="button"
                          onClick={() => onSeek(c.timestamp_seconds ?? 0)}
                          aria-label={`Jump to ${formatTimestamp(c.timestamp_seconds)}`}
                          className="rounded bg-surface-3 px-1.5 py-0.5 font-medium text-info hover:text-text-primary"
                        >
                          {formatTimestamp(c.timestamp_seconds)}
                        </button>
                      ) : (
                        <span className="rounded bg-surface-3 px-1.5 py-0.5 font-medium">
                          {formatTimestamp(c.timestamp_seconds)}
                        </span>
                      ))}
                    {formatRelative(c.created_at)}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove.mutate(c.id)}
                    disabled={remove.isPending && remove.variables === c.id}
                    aria-label="Delete comment"
                    className="rounded p-1 text-text-secondary hover:text-text-primary disabled:opacity-60"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
