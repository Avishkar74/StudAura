import type { LearningPath } from '@/api/types'

interface PathPickerProps {
  id: string
  paths: LearningPath[]
  value: string
  onChange: (id: string) => void
  disabled?: boolean
}

/** Native select of the user's learning paths. */
export function PathPicker({ id, paths, value, onChange, disabled }: PathPickerProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text-secondary">
        Learning path
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-text-primary disabled:opacity-60"
      >
        {paths.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
          </option>
        ))}
      </select>
    </div>
  )
}
