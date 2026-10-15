import { Navigate, Route, Routes } from 'react-router-dom'
import { isSupabaseConfigured } from '@/app/supabase'
import { LoginPage } from '@/features/auth/LoginPage'
import { RedirectIfAuthed, RequireAuth } from '@/features/auth/RequireAuth'
import { SignupPage } from '@/features/auth/SignupPage'
import { HomePage } from '@/features/dashboard/HomePage'

function MissingConfig() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-2xl font-semibold">Supabase is not configured</h1>
      <p className="max-w-md text-text-secondary">
        Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in{' '}
        <code>.env</code> (see <code>.env.example</code>) and restart the dev server.
      </p>
    </main>
  )
}

export function App() {
  if (!isSupabaseConfigured) return <MissingConfig />

  return (
    <Routes>
      <Route element={<RedirectIfAuthed />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route path="/" element={<HomePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
