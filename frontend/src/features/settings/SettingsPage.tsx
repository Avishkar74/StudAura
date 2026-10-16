import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LogOut } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { updateMe } from '@/api/me'
import { Button } from '@/components/Button'
import { useToast } from '@/components/toast/toastContext'
import { TextField } from '@/components/TextField'
import { FormError } from '@/features/auth/AuthCard'
import { useMe } from '@/features/auth/queries'
import { useAuth } from '@/features/auth/useAuth'
import { GoalPanel } from '@/features/goals/GoalPanel'
import { browserTimezone } from '@/features/goals/queries'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { formatDate } from '@/lib/time'

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface-1 p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {hint && <p className="mt-1 text-sm text-text-secondary">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function ProfileForm({ initialName }: { initialName: string }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState(initialName)
  const [error, setError] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: (display_name: string | null) => updateMe({ display_name }),
    onSuccess: (me) => {
      qc.setQueryData(['me'], me)
      toast.show('Profile saved')
    },
  })
  const unchanged = name.trim() === initialName.trim()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await save.mutateAsync(name.trim() || null)
    } catch {
      setError('Could not save your profile. Please try again.')
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-md flex-col gap-4" noValidate>
      <TextField
        label="Display name"
        maxLength={100}
        autoComplete="name"
        placeholder="How should we greet you?"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <FormError message={error} />
      <div>
        <Button type="submit" disabled={save.isPending || unchanged}>
          {save.isPending ? 'Saving…' : 'Save profile'}
        </Button>
      </div>
    </form>
  )
}

/** Profile, account details, the daily goal and sign out (PRD 6.1). */
export function SettingsPage() {
  useDocumentTitle('Settings')
  const me = useMe()
  const { signOut, user } = useAuth()

  const email = me.data?.email ?? user?.email ?? ''

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-4 sm:p-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-text-secondary">Your profile, your goal and your account.</p>
      </header>

      <Section title="Profile" hint="This name appears in the header menu and your greeting.">
        {me.isPending ? (
          <p role="status" className="text-sm text-text-secondary">
            Loading your profile…
          </p>
        ) : me.isError ? (
          <div role="alert" className="flex flex-col items-start gap-2 text-sm">
            <p className="text-warning">Couldn&apos;t load your profile.</p>
            <Button variant="secondary" onClick={() => void me.refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <ProfileForm key={me.data.display_name ?? ''} initialName={me.data.display_name ?? ''} />
        )}
      </Section>

      <Section title="Daily goal" hint="Counted from the time you actually spend watching.">
        <GoalPanel />
      </Section>

      <Section title="Account">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-text-secondary">Email</dt>
          <dd className="break-all font-medium">{email}</dd>
          <dt className="text-text-secondary">Member since</dt>
          <dd className="font-medium">
            {me.data?.created_at ? formatDate(me.data.created_at.slice(0, 10)) : '-'}
          </dd>
          <dt className="text-text-secondary">Time zone</dt>
          <dd className="font-medium">{browserTimezone()}</dd>
        </dl>
        <p className="mt-4 text-sm text-text-secondary">
          Your email and password are managed by your sign-in account. Your videos stay on YouTube;
          StudAura keeps only links, your notes and your own progress.
        </p>
        <Button variant="secondary" className="mt-4" onClick={() => void signOut()}>
          <LogOut className="mr-2 size-4" aria-hidden />
          Sign out
        </Button>
      </Section>
    </div>
  )
}
