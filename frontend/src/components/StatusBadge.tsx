import { CircleCheck, CircleDashed, PlayCircle, RotateCcw, type LucideIcon } from 'lucide-react'
import type { LearningStatus } from '@/api/types'

const STATUS: Record<LearningStatus, { label: string; icon: LucideIcon; tone: string }> = {
  NOT_STARTED: {
    label: 'Not Started',
    icon: CircleDashed,
    tone: 'text-text-secondary',
  },
  IN_PROGRESS: { label: 'In Progress', icon: PlayCircle, tone: 'text-info' },
  COMPLETED: { label: 'Completed', icon: CircleCheck, tone: 'text-success' },
  NEEDS_REVISION: {
    label: 'Needs Revision',
    icon: RotateCcw,
    tone: 'text-revision',
  },
}

export function statusLabel(status: LearningStatus): string {
  return STATUS[status].label
}

/** Status as an icon plus a word, so colour is never the only signal. */
export function StatusBadge({ status }: { status: LearningStatus }) {
  const { label, icon: Icon, tone } = STATUS[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium ${tone}`}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  )
}
