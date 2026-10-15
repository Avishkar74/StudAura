import type { ReactNode } from 'react'
import { Logo } from '@/components/Logo'

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-6 px-4 py-10">
      <Logo />
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface-1 p-6 shadow-lg">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </div>
      <p className="text-sm text-text-secondary">{footer}</p>
    </main>
  )
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p
      role="alert"
      className="rounded-lg border border-accent bg-surface-2 px-3 py-2 text-sm text-text-primary"
    >
      {message}
    </p>
  )
}
