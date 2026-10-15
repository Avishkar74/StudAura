import { useDocumentTitle } from '@/hooks/useDocumentTitle'

/** Stand-in for screens that arrive in later milestones. Keeps every route in the shell reachable. */
export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  useDocumentTitle(title)
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-2 p-6">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="text-text-secondary">{description}</p>
      <p className="mt-6 rounded-xl border border-dashed border-border bg-surface-1 p-6 text-sm text-text-muted">
        This screen is still being built.
      </p>
    </div>
  )
}
