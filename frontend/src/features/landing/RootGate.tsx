import { FullPageSpinner } from '@/components/FullPageSpinner'
import { AppShell } from '@/app/AppShell'
import { useAuth } from '@/features/auth/useAuth'
import { LandingPage } from './LandingPage'

/**
 * What lives at "/": the public landing page for visitors, the app (shell plus dashboard) for
 * signed-in users. Every other private route still sends visitors to /login.
 */
export function RootGate() {
  const { status } = useAuth()
  if (status === 'loading') return <FullPageSpinner />
  if (status === 'signedOut') return <LandingPage />
  return <AppShell />
}
