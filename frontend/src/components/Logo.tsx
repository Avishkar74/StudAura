export function Logo({
  className = '',
  compact = false,
}: {
  className?: string
  /** Hide the wordmark on small screens, leaving only the icon. */
  compact?: boolean
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg viewBox="0 0 32 32" aria-hidden className="size-8">
        <rect width="32" height="32" rx="8" className="fill-accent" />
        <path d="M12 9.5v13l11-6.5z" className="fill-text-primary" />
      </svg>
      <span className={`text-xl font-semibold tracking-tight ${compact ? 'hidden sm:inline' : ''}`}>
        Stud<span className="text-accent">Aura</span>
      </span>
    </span>
  )
}
