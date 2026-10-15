import { CalendarClock, CircleCheck, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import type { LearningStatus } from '@/api/types'
import { ApiError } from '@/api/client'
import { Button } from '@/components/Button'
import { formatDue } from '@/lib/time'
import { RescheduleDialog } from './RescheduleDialog'
import { useCompleteRevision, useFlagRevision, useVideoRevision } from './queries'

interface Props {
  videoId: string
  title: string
  /** The server's new status after a flag or a "mark revised", so the page's badge follows. */
  onStatus: (status: LearningStatus) => void
}

/** Flag the video for revision, or (once flagged) see when it is due, reschedule, or mark it revised. */
export function RevisionControls({ videoId, title, onStatus }: Props) {
  const revision = useVideoRevision(videoId)
  const flag = useFlagRevision(videoId)
  const complete = useCompleteRevision(videoId)
  const [rescheduling, setRescheduling] = useState(false)

  const state = revision.data
  const failed = flag.isError || (complete.isError && !isAlreadyRevised(complete.error))

  if (state?.active && state.due_at) {
    const overdue = state.due_state === 'overdue'
    return (
      <>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-2 text-sm font-medium ${
            overdue ? 'text-warning' : 'text-revision'
          }`}
        >
          <RotateCcw className="size-4" aria-hidden />
          Needs revision · {formatDue(state.due_at, state.today)}
        </span>
        <Button variant="secondary" onClick={() => setRescheduling(true)}>
          <CalendarClock className="mr-2 size-4" aria-hidden />
          Reschedule
        </Button>
        <Button
          variant="secondary"
          disabled={complete.isPending}
          onClick={() =>
            complete.mutate(undefined, {
              onSuccess: (done) => onStatus(done.learning_status),
              // Already revised elsewhere (another tab): refresh instead of erroring.
              onError: (err) => isAlreadyRevised(err) && void revision.refetch(),
            })
          }
        >
          <CircleCheck className="mr-2 size-4" aria-hidden />
          Mark revised
        </Button>
        {failed && <ControlError />}
        {rescheduling && (
          <RescheduleDialog
            videoId={videoId}
            title={title}
            today={state.today}
            dueAt={state.due_at}
            onClose={() => setRescheduling(false)}
          />
        )}
      </>
    )
  }

  return (
    <>
      <Button
        variant="secondary"
        disabled={flag.isPending}
        onClick={() => flag.mutate(undefined, { onSuccess: (s) => onStatus(s.learning_status) })}
      >
        <RotateCcw className="mr-2 size-4" aria-hidden />
        Needs revision
      </Button>
      {failed && <ControlError />}
    </>
  )
}

function isAlreadyRevised(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404
}

function ControlError() {
  return (
    <p role="alert" className="w-full text-sm text-warning">
      Couldn&apos;t update the revision. Try again.
    </p>
  )
}
