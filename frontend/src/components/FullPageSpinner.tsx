export function FullPageSpinner() {
  return (
    <div role="status" aria-label="Loading" className="flex min-h-full items-center justify-center">
      <span className="size-8 animate-spin rounded-full border-2 border-border border-t-accent" />
    </div>
  )
}
