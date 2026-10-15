interface ProgressBarProps {
  value: number
  label: string
  className?: string
}

/** Percentage bar. The label keeps it meaningful to screen readers; colour is not the only cue. */
export function ProgressBar({ value, label, className = '' }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={`h-1.5 w-full overflow-hidden rounded-full bg-surface-3 ${className}`}
    >
      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
    </div>
  )
}
