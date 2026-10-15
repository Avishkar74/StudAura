import { CircleCheck } from 'lucide-react'
import type { DayTotal } from '@/api/types'
import { formatDuration, formatWeekday } from '@/lib/time'

/** The last seven days of tracked viewing time, one bar each, today last (PRD 6.6). */
export function WeeklySummary({
  days,
  targetMinutes,
}: {
  days: DayTotal[]
  targetMinutes: number | null
}) {
  const targetSeconds = targetMinutes ? targetMinutes * 60 : null
  const scale = Math.max(1, targetSeconds ?? 0, ...days.map((d) => d.watched_seconds))
  const total = days.reduce((n, d) => n + d.watched_seconds, 0)

  return (
    <div>
      <p className="mb-3 text-sm text-text-secondary">
        {formatDuration(total)} in the last 7 days
        {targetSeconds !== null && (
          <span className="text-text-muted"> · the dashed line is your goal</span>
        )}
      </p>
      <ul className="grid grid-cols-7 gap-2">
        {days.map((d, i) => {
          const today = i === days.length - 1
          const reached = targetSeconds !== null && d.watched_seconds >= targetSeconds
          const height =
            d.watched_seconds === 0 ? 0 : Math.max(4, (d.watched_seconds / scale) * 100)
          const name = today ? 'Today' : formatWeekday(d.date)
          return (
            <li
              key={d.date}
              aria-label={`${name}: ${formatDuration(d.watched_seconds)}${reached ? ', goal reached' : ''}`}
              className="flex flex-col items-center gap-1.5"
            >
              <div className="relative flex h-32 w-full items-end rounded-md bg-surface-2">
                {targetSeconds !== null && (
                  <span
                    aria-hidden
                    className="absolute inset-x-0 border-t border-dashed border-text-muted"
                    style={{ bottom: `${(targetSeconds / scale) * 100}%` }}
                  />
                )}
                <div
                  aria-hidden
                  className={`w-full rounded-md ${reached ? 'bg-success' : 'bg-accent'}`}
                  style={{ height: `${height}%` }}
                />
              </div>
              <span className="flex items-center gap-1 text-xs text-text-secondary" aria-hidden>
                {reached && <CircleCheck className="size-3 text-success" />}
                {formatDuration(d.watched_seconds)}
              </span>
              <span
                aria-hidden
                className={`text-xs ${today ? 'font-semibold text-text-primary' : 'text-text-muted'}`}
              >
                {name}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
