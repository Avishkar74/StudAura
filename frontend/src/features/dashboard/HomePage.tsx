import { BookOpen, CircleCheck, Clock, RotateCcw, Target, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useShell } from '@/app/shell/shellContext'
import { Button } from '@/components/Button'
import { useMe } from '@/features/auth/queries'
import { useLearningPaths } from '@/features/learning-paths/queries'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { greetingFor } from '@/lib/time'
import { PathCard } from './PathCard'

function MetricCard({
  icon: Icon,
  label,
  value,
  caption,
}: {
  icon: LucideIcon
  label: string
  value: string
  caption: string
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-surface-1 p-4">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-accent">
        <Icon className="size-6" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-text-secondary">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
        <p className="truncate text-xs text-text-muted">{caption}</p>
      </div>
    </div>
  )
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: LucideIcon
  children: ReactNode
}) {
  return (
    <section className="rounded-xl border border-border bg-surface-1 p-4">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
        <Icon className="size-5 text-accent" aria-hidden />
        {title}
      </h2>
      {children}
    </section>
  )
}

function Skeleton() {
  return (
    <div
      role="status"
      aria-label="Loading your dashboard"
      className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
    >
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-44 animate-pulse rounded-xl border border-border bg-surface-1" />
      ))}
    </div>
  )
}

export function HomePage() {
  useDocumentTitle('Home')
  const { openCreatePath } = useShell()
  const me = useMe()
  const paths = useLearningPaths()

  const items = paths.data?.items ?? []
  const name = me.data?.display_name || me.data?.email.split('@')[0] || ''

  const totalVideos = items.reduce((n, p) => n + p.total_videos, 0)
  const completedVideos = items.reduce((n, p) => n + p.completed_videos, 0)
  const activePaths = items.filter(
    (p) => p.total_videos === 0 || p.completed_videos < p.total_videos,
  ).length

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-4 sm:p-6">
      <div>
        <p className="text-text-secondary">
          {greetingFor()}
          {name ? `, ${name}` : ''}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Ready to <span className="text-accent">learn</span> today?
        </h1>
        <p className="mt-1 text-text-secondary">
          Consistent learning today builds the skills for tomorrow.
        </p>
      </div>

      {paths.isPending && <Skeleton />}

      {paths.isError && (
        <div role="alert" className="rounded-xl border border-border bg-surface-1 p-6">
          <p className="font-semibold">We couldn&apos;t load your learning paths.</p>
          <p className="mt-1 text-sm text-text-secondary">
            Check your connection and try again. Nothing has been lost.
          </p>
          <Button className="mt-4" variant="secondary" onClick={() => void paths.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {paths.isSuccess && items.length === 0 && (
        <section className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-surface-1 px-6 py-14 text-center">
          <h2 className="text-xl font-semibold">Your learning workspace starts here.</h2>
          <p className="max-w-md text-text-secondary">
            A learning path groups the videos and playlists you want to learn together. Create your
            first one, then add YouTube videos to it.
          </p>
          <Button onClick={openCreatePath}>Create a learning path</Button>
        </section>
      )}

      {paths.isSuccess && items.length > 0 && (
        <>
          <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={BookOpen}
              label="Active Learning Paths"
              value={String(activePaths)}
              caption={`${items.length} in total`}
            />
            <MetricCard
              icon={CircleCheck}
              label="Videos Completed"
              value={String(completedVideos)}
              caption={`out of ${totalVideos} videos`}
            />
            <MetricCard icon={Clock} label="Learning Time" value="—" caption="Not tracked yet" />
            <MetricCard
              icon={RotateCcw}
              label="Needs Revision"
              value="—"
              caption="Not tracked yet"
            />
          </section>

          <section aria-labelledby="continue-heading">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="continue-heading" className="text-xl font-semibold">
                Continue Learning
              </h2>
              <Link
                to="/learning-paths"
                className="text-sm text-text-secondary hover:text-text-primary"
              >
                View all
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {items.slice(0, 4).map((p, i) => (
                // The fourth card only shows where four columns fit, so no row is left lopsided.
                <div key={p.id} className={i === 3 ? 'hidden 2xl:block' : undefined}>
                  <PathCard path={p} />
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="Today's Goals" icon={Target}>
              <p className="text-sm text-text-secondary">
                Daily goals and viewing-time tracking are coming soon.
              </p>
            </Panel>
            <Panel title="Upcoming Revisions" icon={RotateCcw}>
              <p className="text-sm text-text-secondary">
                You&apos;re all caught up. Mark a video for revision whenever you want to revisit
                it.
              </p>
            </Panel>
            <Panel title="Recent Activity" icon={Clock}>
              <p className="text-sm text-text-secondary">
                Videos you watch will show up here so you can jump back in.
              </p>
            </Panel>
          </div>
        </>
      )}
    </div>
  )
}
