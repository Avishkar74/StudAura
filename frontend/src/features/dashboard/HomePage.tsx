import { useEffect, useState } from 'react'
import { getMe, type Me } from '@/api/me'
import { Button } from '@/components/Button'
import { Logo } from '@/components/Logo'
import { useAuth } from '@/features/auth/useAuth'

/** Placeholder until the app shell and dashboard land (M6, M13). Proves the authenticated round trip. */
export function HomePage() {
  const { signOut, user } = useAuth()
  const [me, setMe] = useState<Me | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    getMe()
      .then((m) => active && setMe(m))
      .catch(() => active && setError(true))
    return () => {
      active = false
    }
  }, [])

  const name = me?.display_name || me?.email || user?.email || ''

  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-6 px-4 text-center">
      <Logo />
      <h1 className="text-3xl font-semibold">{name ? `Welcome, ${name}` : 'Welcome'}</h1>
      <p className="max-w-md text-text-secondary">
        {error
          ? 'Signed in, but the StudAura API did not respond. Check that the backend is running.'
          : 'Your learning workspace starts here.'}
      </p>
      <Button variant="secondary" onClick={() => void signOut()}>
        Sign out
      </Button>
    </main>
  )
}
