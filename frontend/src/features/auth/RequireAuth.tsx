import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { FullPageSpinner } from '@/components/FullPageSpinner'
import { useAuth } from './useAuth'

/** Routes inside need a signed-in user; everyone else is sent to /login and brought back after. */
export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <FullPageSpinner />
  if (status === 'signedOut') return <Navigate to="/login" replace state={{ from: location }} />
  return <Outlet />
}

/** Login/signup are pointless when already signed in. */
export function RedirectIfAuthed() {
  const { status } = useAuth()
  if (status === 'loading') return <FullPageSpinner />
  if (status === 'signedIn') return <Navigate to="/" replace />
  return <Outlet />
}
