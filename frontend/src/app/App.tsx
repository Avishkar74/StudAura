import { Navigate, Route, Routes } from 'react-router-dom'
import { isSupabaseConfigured } from '@/app/supabase'
import { LoginPage } from '@/features/auth/LoginPage'
import { RedirectIfAuthed, RequireAuth } from '@/features/auth/RequireAuth'
import { SignupPage } from '@/features/auth/SignupPage'
import { HomePage } from '@/features/dashboard/HomePage'
import { PathPage } from '@/features/learning-paths/PathPage'
import { PathWorkspacePage, SavedWorkspacePage } from '@/features/player/WorkspacePages'
import { AppShell } from './AppShell'
import { PlaceholderPage } from './PlaceholderPage'

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
        <Route element={<AppShell />}>
          <Route path="/" element={<HomePage />} />
          <Route
            path="/learning-paths"
            element={
              <PlaceholderPage
                title="All Learning Paths"
                description="Manage and explore all your learning paths in one place."
              />
            }
          />
          <Route path="/learning-paths/:pathId" element={<PathPage />} />
          <Route path="/learn/:pathId/:videoId" element={<PathWorkspacePage />} />
          <Route path="/learn/saved/:videoId" element={<SavedWorkspacePage />} />
          <Route
            path="/goals"
            element={
              <PlaceholderPage
                title="Daily Goals"
                description="Set a daily viewing target and track your progress."
              />
            }
          />
          <Route
            path="/revision"
            element={
              <PlaceholderPage
                title="Needs Revision"
                description="Videos you marked for revision, ordered by due date."
              />
            }
          />
          <Route
            path="/notes"
            element={
              <PlaceholderPage
                title="My Notes"
                description="Every note you've written, in one place."
              />
            }
          />
          <Route
            path="/library"
            element={
              <PlaceholderPage
                title="Saved Videos"
                description="Videos you bookmarked to return to."
              />
            }
          />
          <Route
            path="/settings"
            element={
              <PlaceholderPage title="Settings" description="Your profile and preferences." />
            }
          />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
