import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/Logo'

const REPO_URL = 'https://github.com/Avishkar74/StudAura'

function Icon({ children, className = 'size-6' }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {children}
    </svg>
  )
}

const FEATURES: { title: string; body: string; color: string; icon: ReactNode }[] = [
  {
    title: 'Learning paths',
    body: 'Group videos and whole playlists into a path with a target date, and see how far along you are at a glance.',
    color: 'text-info',
    icon: (
      <>
        <path d="M12 3 3 8l9 5 9-5-9-5Z" />
        <path d="m3 13 9 5 9-5" />
      </>
    ),
  },
  {
    title: 'Resume exactly where you stopped',
    body: 'The embedded player remembers your position, so you pick up at the second you left, on any device.',
    color: 'text-info',
    icon: <path d="M8 5v14l11-7L8 5Z" />,
  },
  {
    title: 'Notes that never get lost',
    body: 'Rich-text notes autosave as you type, show Saving, Saved or an error, and keep your text if a save fails.',
    color: 'text-success',
    icon: (
      <>
        <path d="M4 20h4L18.5 9.5l-4-4L4 16v4Z" />
        <path d="m13 7 4 4" />
      </>
    ),
  },
  {
    title: 'Daily goals, counted honestly',
    body: 'Your goal counts the minutes you actually watch. Pausing, seeking and an idle open tab do not add up.',
    color: 'text-warning',
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4" />
      </>
    ),
  },
  {
    title: 'A revision queue',
    body: 'Flag what did not stick, reschedule it, and mark it revised. Due items surface on your dashboard.',
    color: 'text-revision',
    icon: (
      <>
        <path d="M20 12a8 8 0 1 1-2.3-5.7" />
        <path d="M20 4v4h-4" />
      </>
    ),
  },
  {
    title: 'Saved videos library',
    body: 'Keep one-off videos you want to watch later without forcing them into a path.',
    color: 'text-text-secondary',
    icon: <path d="M6 4h12v17l-6-4-6 4V4Z" />,
  },
]

const STEPS = [
  { title: 'Collect', body: 'Paste a video or playlist link and add it to a learning path.' },
  { title: 'Watch', body: 'Learn in the embedded player. Your position is saved as you go.' },
  { title: 'Capture', body: 'Take notes and comments next to the video, saved automatically.' },
  { title: 'Revise', body: 'Flag the hard parts and come back to them on a schedule.' },
]

const TRUST = [
  {
    title: 'Private by design',
    body: 'Sign-in is handled by Supabase Auth. Every request is checked and every query is scoped to you, so nobody else can read your paths or notes.',
    icon: <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" />,
  },
  {
    title: 'Your videos stay on YouTube',
    body: 'StudAura embeds the official YouTube player. It never downloads, copies or re-hosts a video; it stores only the link and your own progress.',
    icon: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="m10 9 5 3-5 3V9Z" />
      </>
    ),
  },
  {
    title: 'Progress you can trust',
    body: 'Jumping to the end never marks a video complete. Status and watch time come from real playback, not from clicks.',
    icon: <path d="m5 12 4 4 10-10" />,
  },
]

const FAQ = [
  {
    q: 'Is StudAura free?',
    a: 'Yes. Create an account with an email address and start building learning paths right away.',
  },
  {
    q: 'Does it download or copy YouTube videos?',
    a: 'No. Videos play in the official YouTube embed. StudAura only keeps the video identifier, its public details and your own notes and progress.',
  },
  {
    q: 'Can I import a whole playlist?',
    a: 'Yes. Paste a playlist link and StudAura imports it in pages, reports any unavailable videos one by one, and adds the rest to your path.',
  },
  {
    q: 'What happens if saving a note fails?',
    a: 'Your text stays in the editor and in your browser, the editor shows an error, and you can retry. Nothing is discarded without your say-so.',
  },
]

const linkPrimary =
  'inline-flex items-center justify-center rounded-lg bg-accent-hover px-5 py-3 text-base font-semibold text-text-primary transition-colors hover:bg-accent'
const linkSecondary =
  'inline-flex items-center justify-center rounded-lg border border-border bg-surface-2 px-5 py-3 text-base font-semibold text-text-primary transition-colors hover:bg-surface-3'

function ProductPreview() {
  return (
    <div
      role="img"
      aria-label="Preview of the StudAura workspace: a video player with a progress bar, notes that autosave, and a daily goal ring"
      className="overflow-hidden rounded-2xl border border-border bg-surface-1 shadow-2xl shadow-black/50"
    >
      <div aria-hidden className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="size-3 rounded-full bg-surface-3" />
        <span className="size-3 rounded-full bg-surface-3" />
        <span className="size-3 rounded-full bg-surface-3" />
        <span className="ml-3 truncate text-xs text-text-muted">Data Structures · Lecture 4</span>
      </div>
      <div aria-hidden className="grid gap-4 p-4 md:grid-cols-[1.6fr_1fr]">
        <div>
          <div className="relative flex aspect-video items-center justify-center rounded-xl bg-surface-2">
            <span className="flex size-14 items-center justify-center rounded-full bg-accent-hover">
              <svg viewBox="0 0 24 24" className="ml-0.5 size-6 fill-text-primary">
                <path d="M8 5v14l11-7L8 5Z" />
              </svg>
            </span>
            <div className="absolute inset-x-4 bottom-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full w-[62%] rounded-full bg-accent" />
              </div>
              <div className="mt-1.5 flex justify-between text-[11px] text-text-muted">
                <span>18:42</span>
                <span>30:10</span>
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
            <span className="rounded-full bg-surface-3 px-2.5 py-1 text-info">In progress</span>
            <span className="rounded-full bg-surface-3 px-2.5 py-1 text-revision">
              Needs revision
            </span>
            <span className="rounded-full bg-surface-3 px-2.5 py-1 text-success">
              Resume at 18:42
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-border bg-surface-2 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Notes</span>
              <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-medium text-success">
                Saved
              </span>
            </div>
            <div className="mt-3 space-y-2">
              <div className="h-2 w-11/12 rounded bg-surface-3" />
              <div className="h-2 w-9/12 rounded bg-surface-3" />
              <div className="h-2 w-10/12 rounded bg-surface-3" />
              <div className="h-2 w-5/12 rounded bg-surface-3" />
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-xl border border-border bg-surface-2 p-3">
            <svg viewBox="0 0 36 36" className="size-14 -rotate-90">
              <circle
                cx="18"
                cy="18"
                r="15"
                fill="none"
                className="stroke-surface-3"
                strokeWidth="4"
              />
              <circle
                cx="18"
                cy="18"
                r="15"
                fill="none"
                className="stroke-accent"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray="66 94"
              />
            </svg>
            <div>
              <p className="text-sm font-semibold">Daily goal</p>
              <p className="text-xs text-text-secondary">42 of 60 minutes</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function LandingPage() {
  return (
    <div className="min-h-full bg-bg text-text-primary">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-surface-3 px-4 py-2 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/" aria-label="StudAura home">
            <Logo />
          </Link>
          <nav aria-label="Sections" className="hidden items-center gap-6 text-sm md:flex">
            <a href="#features" className="text-text-secondary hover:text-text-primary">
              Features
            </a>
            <a href="#how" className="text-text-secondary hover:text-text-primary">
              How it works
            </a>
            <a href="#trust" className="text-text-secondary hover:text-text-primary">
              Trust
            </a>
            <a href="#faq" className="text-text-secondary hover:text-text-primary">
              FAQ
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="rounded-lg px-3 py-2 text-sm font-semibold text-text-secondary hover:text-text-primary"
            >
              Sign in
            </Link>
            <Link
              to="/signup"
              className="rounded-lg bg-accent-hover px-4 py-2 text-sm font-semibold text-text-primary hover:bg-accent"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 md:pt-20">
          <div className="mx-auto max-w-3xl text-center">
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-1 px-3 py-1 text-xs font-medium text-text-secondary">
              <span className="size-1.5 rounded-full bg-success" aria-hidden />
              Free personal learning workspace for YouTube
            </p>
            <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
              Turn YouTube into learning you actually <span className="text-accent">finish</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-text-secondary">
              Organise videos and playlists into learning paths, take notes beside the player, track
              real progress, and revise what did not stick. Watch. Capture. Track. Revise.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link to="/signup" className={linkPrimary}>
                Start learning free
              </Link>
              <Link to="/login" className={linkSecondary}>
                Sign in
              </Link>
            </div>
            <p className="mt-4 text-sm text-text-muted">
              No credit card. Your videos stay on YouTube.
            </p>
          </div>
          <div className="mx-auto mt-14 max-w-4xl">
            <ProductPreview />
          </div>
        </section>

        <section id="features" className="scroll-mt-20 border-t border-border bg-surface-1/40">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-3xl font-bold tracking-tight">
              Everything a self-taught learner needs
            </h2>
            <p className="mt-3 max-w-2xl text-text-secondary">
              One calm workspace instead of a dozen tabs, bookmarks and half-finished playlists.
            </p>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <li key={f.title} className="rounded-2xl border border-border bg-surface-1 p-6">
                  <span
                    className={`flex size-11 items-center justify-center rounded-xl bg-surface-2 ${f.color}`}
                  >
                    <Icon>{f.icon}</Icon>
                  </span>
                  <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-text-secondary">{f.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="how" className="scroll-mt-20 border-t border-border">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-3xl font-bold tracking-tight">How it works</h2>
            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-2xl border border-border bg-surface-1 p-6">
                  <span
                    aria-hidden
                    className="flex size-9 items-center justify-center rounded-full bg-accent-hover text-sm font-bold"
                  >
                    {i + 1}
                  </span>
                  <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-text-secondary">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="trust" className="scroll-mt-20 border-t border-border bg-surface-1/40">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-3xl font-bold tracking-tight">Built to be trusted</h2>
            <p className="mt-3 max-w-2xl text-text-secondary">
              Your notes and progress matter, so the basics are done carefully.
            </p>
            <ul className="mt-10 grid gap-4 md:grid-cols-3">
              {TRUST.map((t) => (
                <li key={t.title} className="rounded-2xl border border-border bg-surface-1 p-6">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-surface-2 text-success">
                    <Icon>{t.icon}</Icon>
                  </span>
                  <h3 className="mt-4 text-lg font-semibold">{t.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-text-secondary">{t.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="faq" className="scroll-mt-20 border-t border-border">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
            <h2 className="text-3xl font-bold tracking-tight">Questions</h2>
            <div className="mt-8 divide-y divide-border rounded-2xl border border-border bg-surface-1">
              {FAQ.map((item) => (
                <details key={item.q} className="group px-6 py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                    {item.q}
                    <span
                      aria-hidden
                      className="text-xl text-text-secondary transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-text-secondary">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-border bg-surface-1/40">
          <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
            <h2 className="text-3xl font-bold tracking-tight">
              Start your first learning path today
            </h2>
            <p className="mt-3 text-text-secondary">
              It takes a minute to sign up and a link to add your first video.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link to="/signup" className={linkPrimary}>
                Create your free account
              </Link>
              <Link to="/login" className={linkSecondary}>
                I already have an account
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-4 py-8 text-sm text-text-secondary sm:flex-row sm:items-center sm:px-6">
          <div className="flex flex-col gap-1">
            <Logo />
            <p>Watch. Capture. Track. Revise.</p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link to="/login" className="hover:text-text-primary">
              Sign in
            </Link>
            <Link to="/signup" className="hover:text-text-primary">
              Create account
            </Link>
            <a href={REPO_URL} className="hover:text-text-primary" rel="noreferrer">
              Source code
            </a>
          </nav>
        </div>
        <p className="border-t border-border px-4 py-4 text-center text-xs text-text-muted">
          StudAura embeds the official YouTube player and is not affiliated with YouTube.
        </p>
      </footer>
    </div>
  )
}
