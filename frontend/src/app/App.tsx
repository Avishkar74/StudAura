import { useBackendStatus, type BackendStatus } from '@/hooks/useBackendStatus'

const STATUS_LABEL: Record<BackendStatus, string> = {
  checking: 'Checking API…',
  online: 'API online',
  offline: 'API offline',
}

const STATUS_DOT: Record<BackendStatus, string> = {
  checking: 'bg-text-muted',
  online: 'bg-success',
  offline: 'bg-accent',
}

export function App() {
  const status = useBackendStatus()

  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">
        Stud<span className="text-accent">Aura</span>
      </h1>
      <p className="max-w-md text-text-secondary">Watch. Capture. Track. Revise.</p>
      <p
        role="status"
        className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-1 px-4 py-1.5 text-sm text-text-secondary"
      >
        <span aria-hidden className={`size-2 rounded-full ${STATUS_DOT[status]}`} />
        {STATUS_LABEL[status]}
      </p>
    </main>
  )
}
