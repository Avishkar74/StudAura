import { useState } from 'react'
import { Button } from '@/components/Button'
import { ProgressBar } from '@/components/ProgressBar'
import { formatDuration } from '@/lib/time'
import { GoalDialog } from './GoalDialog'
import { useGoal } from './queries'

/** Today's goal: target, tracked time, progress and what is left (PRD 6.2, 7.5). */
export function GoalPanel() {
  const goal = useGoal()
  const [editing, setEditing] = useState(false)

  if (goal.isPending) {
    return <p className="text-sm text-text-secondary">Loading your goal…</p>
  }
  if (goal.isError) {
    return (
      <div role="alert" className="flex flex-col items-start gap-2 text-sm">
        <p className="text-warning">Couldn&apos;t load your daily goal.</p>
        <Button variant="secondary" onClick={() => void goal.refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  const { daily_target_minutes: target, today_watched_seconds: watched } = goal.data
  const dialog = editing ? <GoalDialog current={target} onClose={() => setEditing(false)} /> : null

  if (target === null) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-text-secondary">
          Set a daily viewing target to build a steady habit. Today so far:{' '}
          <strong className="text-text-primary">{formatDuration(watched)}</strong>.
        </p>
        <Button variant="secondary" onClick={() => setEditing(true)}>
          Set a daily goal
        </Button>
        {dialog}
      </div>
    )
  }

  const targetSeconds = target * 60
  const pct = (watched / targetSeconds) * 100
  const remaining = Math.max(0, targetSeconds - watched)

  return (
    <div className="flex flex-col gap-3">
      <ProgressBar value={pct} label="Today's viewing goal" />
      <p className="text-sm">
        <strong>{Math.floor(watched / 60)}</strong> / {target} min
        {goal.data.goal_achieved ? (
          <span className="text-success">
            {' '}
            — Daily goal reached — {formatDuration(watched)} today
          </span>
        ) : (
          <span className="text-text-secondary"> — {formatDuration(remaining)} remaining</span>
        )}
      </p>
      <Button variant="secondary" className="self-start" onClick={() => setEditing(true)}>
        Edit goal
      </Button>
      {dialog}
    </div>
  )
}
