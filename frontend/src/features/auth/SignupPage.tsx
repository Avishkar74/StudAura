import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { AuthCard, FormError } from './AuthCard'
import { useAuth } from './useAuth'

const MIN_PASSWORD_LENGTH = 8

export function SignupPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    setBusy(true)
    setError(null)
    const result = await signUp(email.trim(), password, displayName.trim() || undefined)
    setBusy(false)
    if (result.error) setError(result.error)
    else if (result.needsConfirmation) setConfirmEmail(email.trim())
    else navigate('/', { replace: true })
  }

  if (confirmEmail) {
    return (
      <AuthCard
        title="Check your email"
        subtitle="One more step to activate your account."
        footer={
          <Link to="/login" className="font-medium text-text-primary underline">
            Back to sign in
          </Link>
        }
      >
        <p role="status" className="text-sm text-text-secondary">
          We sent a confirmation link to{' '}
          <strong className="text-text-primary">{confirmEmail}</strong>. Open it, then sign in. If it
          doesn&apos;t arrive in a few minutes, check your spam folder.
        </p>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Create your account"
      subtitle="Watch. Capture. Track. Revise."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-text-primary underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <TextField
          label="Name (optional)"
          autoComplete="name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <FormError message={error} />
        <Button type="submit" disabled={busy || !email || !password}>
          {busy ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </AuthCard>
  )
}
