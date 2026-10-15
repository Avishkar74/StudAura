# StudAura — Product Requirements Document

| Field | Value |
|---|---|
| Version | 1.1 — Supabase baseline |
| Date | 15 October 2026 |
| Product | StudAura |
| Status | Baseline for implementation |
| Audience | Students who use YouTube videos and playlists to learn |
| Objective | Focused learning workspace + college DevOps capstone |

**Product principle: Watch. Capture. Track. Revise.**

---

## 1. Executive Summary

StudAura is a dark-only, YouTube-inspired personal learning workspace. Students collect YouTube
videos and playlists into learning paths, watch embedded videos, take typed notes linked to each
video, track playback progress, set daily learning goals, and manage a revision queue.

StudAura is not a video-hosting service. It provides a focused organisational layer around
YouTube embeds. It must not download videos, scrape YouTube pages, or conceal required player
elements.

The project is simultaneously a college DevOps capstone. The tech stack and delivery pipeline are
fixed by the rubric: React + Vite, FastAPI, Supabase (auth + PostgreSQL), SQLAlchemy, Alembic,
Pytest, Docker Compose, GitHub Actions, Trivy, GHCR, Terraform, AWS EKS, Kubernetes + Helm,
Ingress, HPA, Prometheus, Grafana.

---

## 2. Problem Statement

Students watch educational YouTube videos but keep notes, progress indicators, and revision
reminders in separate tools or track them manually. This fragments the learning workflow and makes
it hard to resume, organise, and revisit material.

### 2.1 Goals

- Let students create learning paths and add individual YouTube videos or import a YouTube playlist.
- Provide a video-first workspace with contextual notes, comments, progress, and playlist navigation.
- Persist typed notes and comments against the correct video and user.
- Track playback position automatically via the YouTube IFrame Player API.
- Let students manually set learning status and preserve revision intent.
- Calculate learning-path completion and daily tracked viewing time consistently.
- Offer a practical daily goal and a simple revision queue.
- Build a testable full-stack application that satisfies the DevOps capstone rubric.

### 2.2 Non-Goals (MVP)

- Hosting, downloading, transcoding, or redistributing YouTube video files.
- Bypassing ads, restrictions, or required YouTube player UI.
- AI-generated notes or transcript summarisation.
- Handwriting canvas, PDF/image note upload, OCR.
- Social features: shared playlists, collaboration, public comments, leaderboards.
- Teacher/institution features: exams, certificates, course enrollment, LMS.
- Native mobile apps (responsive web only).
- Light mode (dark-only).
- Advanced spaced-repetition algorithms.

---

## 3. Target Users

| Persona | Needs | Primary jobs-to-be-done |
|---|---|---|
| Student learning from YouTube | Organise video-based study, resume quickly | Import playlist, watch a lesson, take notes, see progress |
| Student preparing for exams | Identify and revisit difficult topics | Mark Needs Revision, open revision queue, revisit video + notes |
| Student following a deadline | Break a large playlist into daily effort | Set target date and daily minutes, monitor goal progress |

### 3.1 Core User Journey

1. Sign up or sign in (Supabase Auth).
2. Create a learning path or import a YouTube playlist.
3. Open a video in the learning workspace.
4. Watch the video while StudAura saves playback position.
5. Write notes or add a timestamped comment.
6. Set or update the video's learning status.
7. Use the dashboard to continue learning or review due items.
8. Complete daily goals and revisit videos marked for revision.

---

## 4. Feature Scope and Priorities

| Priority | Capability | MVP commitment |
|---|---|---|
| P0 | Authentication | Supabase Auth; users access only their own data. |
| P0 | Learning paths | Create, rename, view, delete personal learning paths. |
| P0 | Individual video import | Accept YouTube video URLs, validate, add to a learning path. |
| P0 | Playlist import | Import playlist entries via YouTube Data API; preserve order; report unavailable items. |
| P0 | Embedded playback | Play videos using the YouTube IFrame Player API. |
| P0 | Typed notes | One primary note per user/video; autosave with visible state. |
| P0 | Video learning status | NOT_STARTED, IN_PROGRESS, COMPLETED, NEEDS_REVISION with manual controls. |
| P0 | Playback position | Save periodically; offer resume. |
| P0 | Dashboard | Continue Learning, goals, paths, revision due, recent activity. |
| P0 | DevOps pipeline | Full rubric stack (see §13). |
| P1 | Comments | Personal comments per video; optional timestamp. |
| P1 | Daily goals | Daily tracked-viewing-time target + learning-path target date. |
| P1 | Revision queue | Flag for revision, default next-day due date, mark revised. |
| P1 | Saved videos library | Bookmark videos independently of path membership. |
| P1 | Search | Search path and video titles. |
| P1 | Playlist drawer | Right-side playlist drawer in the learning workspace. |
| P1 | Coming Soon modal | Upload Notes button opens modal; no upload implemented. |
| P2 | Timestamp-linked notes | Click a timestamp to seek in the player. |
| P2 | Advanced revision scheduling | Spaced repetition deferred. |

---

## 5. Information Architecture

```
Global header
  [☰] [StudAura / Home] [Search] [Add ▼] [Profile]

Left sidebar (collapsible, persisted)
  Home
  All Learning Paths
  ─ individual paths ─
  Daily Goals
  Needs Revision
  My Notes
  Saved Videos
  Settings

Learning workspace
  Centre:   YouTube player + video metadata + status/progress controls
  Right:    Notes | Comments | Progress  (tabs, default Notes)
  Playlist: right-side drawer, replaces the right panel while open
```

### 5.1 Navigation Rules

- StudAura logo and Home sidebar item both route to `/` (same destination).
- Clicking a path opens its overview; clicking a video inside a path opens the workspace.
- Navigating to a different path while watching a video closes the current video — no silent replacement.
- The playlist drawer and Notes/Comments/Progress panel are mutually exclusive on the right side. Closing the drawer restores the previously active tab.
- The playlist drawer stays open while selecting videos inside it; the player and right-panel context update.
- Persist: sidebar collapsed/expanded state, selected right-panel tab per session.
- Route changes must not silently discard unsaved notes — prompt if the editor is dirty.

---

## 6. UI/UX Requirements

### 6.1 Visual Direction

Dark-only, YouTube-inspired. Familiar to users of dark video interfaces without copying YouTube's branding. No light-mode toggle.

Design tokens are defined in `frontend/src/styles/tokens.css`. See `CLAUDE.md` for the full token table.

**Accessibility:** do not rely on colour alone to communicate status — always include a label or icon. Verify contrast on all interactive states including hover and disabled.

### 6.2 Home / Dashboard

Purpose: answer "What should I learn next?" — action-oriented, not a dense analytics page.

```
┌─────────────────────────────────────────────────────────────┐
│ ☰ StudAura          Search...          [+ Add]   [User]   │
├──────────────┬──────────────────────────────────────────────┤
│ Home         │ Good evening, [Name]                        │
│ All Paths    │ Continue building your learning streak.      │
│ Path A       │                                             │
│ Path B       │ [Active paths] [Completed] [Min today] [Rev]│
│ Daily Goals  │                                             │
│ Needs Rev.   │ ── CONTINUE LEARNING ───────────────────── │
│ My Notes     │ [card: thumbnail, title, progress, Resume]  │
│ Saved Videos │                                             │
│              │ TODAY'S GOAL          NEEDS REVISION        │
│              │ [min target/progress] [due video list]      │
│              │                                             │
│              │ YOUR LEARNING PATHS   RECENTLY WATCHED      │
│              │ [path cards]          [compact video rows]  │
└──────────────┴──────────────────────────────────────────────┘
```

**Sections:**

- **Welcome header** — concise greeting, non-intrusive.
- **Summary metrics** — active learning paths, completed videos, tracked time today/this week, videos due for revision.
- **Continue Learning** — most recently watched unfinished video; title, path, progress, Resume action.
- **Today's Goal** — target minutes, tracked minutes, progress bar, remaining.
- **Needs Revision preview** — most urgent due items + View All.
- **Learning Paths** — cards: title, completed/total, percentage, optional target date.
- **Recently Watched** — compact list for quick return.
- **Empty state** — explain how to create a path; one prominent Add action; no fake statistics.

### 6.3 All Learning Paths

- Cards or compact list with title, description, progress, target date, last activity.
- Sort by: Recently Active, Name, Progress, Target Date.
- Primary action: Create Learning Path. Secondary: Add Video / Import Playlist.
- Empty state explains what a learning path is.

### 6.4 Learning Path Overview

```
┌─────────────────────────────────────────────────────────────┐
│ ← All Learning Paths                                        │
│ Data Structures & Algorithms          [Edit] [Add] [⋯]     │
│ 24 of 60 completed ████████░░░░ 40%   Target: 30 Oct       │
│ [Continue Learning]  [Import Playlist]                      │
├─────────────────────────────────────────────────────────────┤
│ Videos 60 | Completed 24 | In progress 3 | Needs rev 5     │
│ Search videos…  [Status ▼]  [Sort: Playlist order ▼]       │
│ 01 [thumb] Introduction to DSA   12:40  Completed          │
│ 02 [thumb] Arrays                28:10  Completed          │
│ 03 [thumb] Binary Search         52:10  In Progress  64%   │
│ 04 [thumb] Sorting               41:05  Not Started        │
└─────────────────────────────────────────────────────────────┘
```

- **Continue Learning** selects: last active in-progress video in path order; else first unfinished; else "Review Completed Videos".
- Each video row shows thumbnail, title, duration (if known), status, progress, Open action.
- Clicking a row opens the workspace.

### 6.5 Video Learning Workspace

```
┌──────────────┬───────────────────────────┬─────────────────┐
│ compact nav  │                           │ Notes│Cmts│Prog │
│ Home         │  YouTube player           ├─────────────────┤
│ Paths        │                           │ Notes editor /  │
│ Goals        │                           │ Comments /      │
│ Revision     │                           │ Path progress   │
│ Notes        │                           │                 │
│ Saved        │  Title / channel / meta   │ [Upload Notes   │
│              │  Playback progress        │  Coming Soon]   │
│              │  [Status ▼] [✓] [Revise] │                 │
└──────────────┴───────────────────────────┴─────────────────┘
```

- **Notes tab** — typed editor, autosave status (Saving / Saved / error + retry), basic formatting, Upload Notes button (Coming Soon modal).
- **Comments tab** — user's comments for this video; optional timestamp; add/delete.
- **Progress tab** — current video's playback/status AND overall path standing (completion %, counts by status).
- **Playlist button** — opens right-side drawer; replaces tabs. Drawer shows path title, progress, ordered video list with badges.
- When a video changes: update notes/comments/progress context; save pending notes first.
- Left sidebar may collapse to icon rail.

### 6.6 Daily Goals

```
TODAY'S GOALS                             [Edit Goal]
Daily viewing target: 60 minutes
[████████████░░░░░░] 42 / 60 min — 18 min remaining

Today's planned videos
[ ] Binary Search         52 min   [Open]
[ ] Process Scheduling    15 min   [Open]

Weekly summary: Mon … Sun

Learning-path deadline goals
[Path]  20 h remaining / 10 days ≈ 2 h/day  (estimate)
```

- Daily tracked-viewing-time target in minutes.
- Optional target completion date per learning path.
- Daily progress = `SUM(watched_seconds)` from `ViewingSession` where `started_at::date = today` (user timezone).
- Deadline estimate = remaining known video duration / remaining calendar days. Label it as an estimate.

### 6.7 Needs Revision

```
NEEDS REVISION                     [Sort: Due date ▼]

Due today (2)
  Binary Search — DSA              [Review Now] [Reschedule]
  Process Scheduling — OS          [Review Now] [Reschedule]

Upcoming
  TCP Congestion Control  Due tomorrow  [Review Now]
```

- Ordered by overdue/due date then most recently flagged.
- Review Now opens the workspace at saved position; shows associated notes.
- Mark as Revised removes from active queue; user can re-flag later.
- Default due date = next calendar day.
- Needs Revision does not erase completion history.

### 6.8 My Notes

- Notes across all paths in one searchable list.
- Each row: note title/first line, video title, path, last edited, Open Video.
- Search by note text; filter by path.
- If a video is no longer available, keep the note accessible.

### 6.9 Saved Videos (Library)

- Saved = explicitly bookmarked. Membership in a path is separate.
- Toggle saved state from the learning workspace.
- List: thumbnail, title, status, playback progress, path membership if any, last activity.
- Filters: All, In Progress, Completed, Needs Revision. Sort: Recently Saved / Recently Watched.
- Unsaving removes the bookmark only — notes/progress/path membership unchanged.
- A saved video not in a path can be opened via `/learn/saved/:videoId`.

### 6.10 Add Video / Import Playlist

- Add menu: Add YouTube Video, Import YouTube Playlist, Create Learning Path.
- **Individual video** — paste URL → validate → resolve metadata → select/create path → confirm Add.
- **Playlist** — paste URL → validate → fetch entries via YouTube Data API → preview (title, count) → choose path → import.
- Duplicates in the same path: skip and explain "already added".
- Import result always returns `{added, skipped, failed, items[]}`.
- Handle: invalid URL, private/deleted/unavailable video, embed-disabled, API quota, network timeout, missing metadata — each with an actionable message.
- Never download video content or scrape YouTube HTML.

### 6.11 Profile / Settings

Minimal: display name, account email, sign out, sidebar preference, account deletion (if required). No light-mode switch.

### 6.12 Upload Notes — Coming Soon Modal

```
┌─────────────────────────────────────────┐
│  Upload notes         Coming soon       │
│                                         │
│  You'll be able to attach handwritten   │
│  notes and documents to this video.     │
│  For now, create notes directly here.   │
│                          [Got it]       │
└─────────────────────────────────────────┘
```

No file input, storage, or upload API. Button label: "Upload Notes" or "Upload Notes (Coming soon)".

---

## 7. Learning State and Progress Rules

### 7.1 Concepts (keep separate)

| Concept | Values | Rules |
|---|---|---|
| `last_position_seconds` | Float ≥ 0 | Saved periodically, on pause, on video change. |
| Playback percentage | `position / duration × 100` | Display only when duration is known; clamp 0–100%. |
| `learning_status` | NOT_STARTED / IN_PROGRESS / COMPLETED / NEEDS_REVISION | Student sets manually; automation follows strict rules. |
| `ever_completed_at` | Timestamp or null | Preserved if status later becomes NEEDS_REVISION. |
| Revision state | `due_at`, `revised_at`, `active` | Separate from completion; revision does not erase completion. |
| Saved/bookmarked | Boolean | Independent of path membership and learning status. |

### 7.2 Playback Tracking

- Use the YouTube IFrame Player API (`onStateChange`, `getCurrentTime`).
- Persist position every 15–30 s while playing, on pause, and on video change/unload.
- Offer "Resume from mm:ss?" when a saved position is meaningful; allow Start Over.
- **A seek must not by itself prove the student watched the skipped content.**
- Count viewing time from observed playback intervals; deduplicate repeated updates; exclude pause/seek time.
- Seek-only detection: if `currentTime` jumps > 2 s in a single interval without a corresponding playback event sequence, mark the session as seeked. A seeked session cannot trigger auto-completion.
- If the player cannot expose events, allow manual status updates and show "tracking unavailable".

### 7.3 Completion Rules

| Trigger | Outcome |
|---|---|
| Playback reaches ~90% | Show lightweight "Mark completed?" prompt if not already completed. Do not auto-complete. |
| Player fires `ENDED` event + session was not seeked | Auto-set status = COMPLETED; record `ever_completed_at`. |
| Manual "Mark Completed" | Always sets COMPLETED; records `ever_completed_at`. |
| Manual "In Progress" | Overrides suggestion; preserves `last_position_seconds`. |
| Setting NEEDS_REVISION | Does NOT clear `ever_completed_at`. |
| Rewatching a completed video | Does not increment path completion above 100%; may add to daily viewing time. |

### 7.4 Learning-Path Completion

```
completion_pct = (distinct videos in path with ever_completed_at IS NOT NULL) / (total distinct videos in path) × 100
```

A NEEDS_REVISION video counts as completed only if `ever_completed_at IS NOT NULL`.

### 7.5 Daily Goal Accounting

- Source: `SUM(watched_seconds)` from `ViewingSession` where `started_at::date = today` (user timezone).
- Pauses, seeks, and duplicate interval writes must not inflate the total.
- All writes to `ViewingSession` are idempotent by `(user_id, video_id, started_at rounded to minute)`.
- Daily target may be exceeded; show "Daily goal reached — X min today".
- Day boundaries use the user's configured timezone.

### 7.6 Revision Scheduling

- Flagging NEEDS_REVISION creates/updates an active `RevisionItem` with `due_at = tomorrow` (if none supplied).
- Mark as Revised: set `revised_at = now()`, `active = false`; remove from active queue.
- User may reschedule or re-flag.
- At most one active revision per user/video.

---

## 8. Error, Empty, Loading, and Success States

| Situation | Expected UI |
|---|---|
| New account, no paths | "Your learning workspace starts here." CTA: Create a learning path. |
| Empty path | "No videos yet." CTA: Add a video or import a playlist. |
| Playlist import running | Progress indicator with imported/total count. |
| Partial playlist failure | "Imported 32 videos. 3 items could not be added." Provide details. |
| Video unavailable | "This video can't be played here. It may be private, removed, or restricted." Preserve notes. |
| YouTube quota / network | Explain import could not complete; offer retry. |
| Notes saving | Show "Saving…" → "Saved"; on failure "Couldn't save — Retry"; preserve content. |
| No revisions | "You're all caught up. Mark a video for revision whenever you want to revisit it." |
| No saved videos | "Save videos you want to return to. They'll appear here." |
| Goal achieved | "Daily goal reached" with actual time tracked. |
| Backend unavailable | Recoverable error; preserve local form/editor state. |

---

## 9. Non-Functional Requirements

| Area | Requirement |
|---|---|
| Responsive design | Desktop 3-area layout; tablet uses drawers; mobile stacked. No horizontal overflow. |
| Accessibility | Keyboard-accessible, visible focus, semantic labels, sufficient contrast, no colour-only status. |
| Performance | Paginate long lists; debounce search and autosave; no per-second API calls. |
| Reliability | Notes not silently lost; show save state; preserve editor content after API failure. |
| Security | Auth enforced; ownership on all resources; secrets out of frontend/repo. |
| Privacy | Notes, comments, goals, progress are private by default. |
| Observability | Health + readiness endpoints; Prometheus metrics; Grafana dashboard. |
| YouTube compliance | Supported embed/player APIs only; no downloads or scraping. |
| Cost control | Local Compose first; document Terraform destroy after evaluation. |

---

## 10. Acceptance Criteria

| ID | Feature | Criteria |
|---|---|---|
| AC-01 | Create path | Signed-in user can create, rename, open, delete a path; other users cannot access it. |
| AC-02 | Add video | Valid YouTube URL resolves to metadata and is added to the selected path; invalid URL shows actionable error. |
| AC-03 | Import playlist | Available entries import in order; duplicates handled; unavailable entries reported without losing successful imports. |
| AC-04 | Play video | Supported video plays in embed; restricted/unavailable video shows fallback. |
| AC-05 | Resume | After leaving and returning, saved position is available with Resume / Start Over. |
| AC-06 | Notes | Create/edit; autosave state visible; failed save preserves content and offers retry. |
| AC-07 | Comments | Add/delete personal comments; optional timestamps work. |
| AC-08 | Status | All four statuses persist; NOT_STARTED is the default. |
| AC-09 | Completion | Player ENDED + no seek = auto-complete; seeking to end alone does not. |
| AC-10 | Revision | Flagging creates revision with next-day default; marking revised removes from queue; completion history preserved. |
| AC-11 | Daily goal | Tracked active playback updates goal; pause time and duplicate writes excluded. |
| AC-12 | Path progress | Completion % based on distinct completed videos / total path videos. |
| AC-13 | Saved library | Save/unsave affects bookmark only; notes/progress/path membership unchanged. |
| AC-14 | Navigation | Logo and Home route to same dashboard; sidebar state persists; back/forward predictable. |
| AC-15 | Upload Notes | Clicking Upload Notes opens Coming Soon modal; no upload attempted. |
| AC-16 | Dark theme | All MVP screens dark; no light-mode toggle. |
| AC-17 | Observability | Health/readiness respond; Prometheus scrapes metrics; Grafana renders panels. |
| AC-18 | CI/CD | PR runs checks/tests; push builds, scans, and publishes commit-SHA images to GHCR. |

---

## 11. Testing Strategy

### 11.1 Backend

- Unit tests: progress percentage, status transitions, revision scheduling, daily goal accounting, duplicate import handling, URL validation.
- API tests: CRUD, validation, auth/ownership enforcement, error shapes, pagination.
- DB integration: constraints, cascade behaviour, unique indexes.
- Alembic: upgrade from empty database to current schema.
- YouTube adapter: all error modes via the fake adapter (private, deleted, quota, network timeout, duplicate).

### 11.2 Frontend

- Component tests (Vitest + RTL): status badges, progress bars, note save states, tabs, drawers, dialogs, empty/error states.
- Integration: path/video selection, right-panel tab switching, playlist drawer open/close + tab restoration, notes context change on video switch.
- Logo and Home sidebar route to the same `/` route.
- Unsaved note content not discarded on navigation.
- Responsive layout and keyboard navigation.

### 11.3 End-to-End (Playwright, main branch)

1. Sign up, create a path, import a playlist, verify order.
2. Open a video, watch briefly, refresh, resume from saved position.
3. Write a note and comment; verify persistence after refresh.
4. Mark a video completed and another Needs Revision.
5. Verify path completion % and revision queue.
6. Set a daily goal; verify tracked playback time increases.

---

## 12. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| YouTube API quota | Server-side key; fake adapter in tests; retry/partial result handling. |
| Video cannot be embedded | Detect player error; explain limitation; preserve notes; link to YouTube. |
| Playback tracking inaccuracy | Treat time as estimate; deduplicate; exclude seek; retain manual controls. |
| Scope creep | Protect DevOps rubric milestones first; defer P2 features. |
| Cloud costs | Local Compose first; document Terraform destroy; use cost-conscious instance sizes. |
| Autosave race conditions | Debounce; idempotent PUT; show save state; preserve local text on error. |
| Data ownership leaks | Enforce user_id in every backend query; test cross-user access explicitly. |

---

## 13. DevOps Capstone Alignment

| Rubric module | How StudAura supports it |
|---|---|
| Frontend + Backend + Database (10) | React UI, FastAPI REST API, Supabase PostgreSQL, Alembic migrations. |
| Testing + Code Quality (10) | Pytest + Vitest, integration tests, migration tests, linting. |
| Git + GitHub (5) | Meaningful commits, branches/PRs, README, issues. |
| Docker + Compose (10) | Separate frontend/backend images + local PostgreSQL; reproducible Compose env. |
| GitHub Actions CI/CD (15) | Lint + tests + build + SHA-tagged images; policy-gated publishing. |
| Trivy security scanning (5) | Scan both images; document findings and severity policy. |
| Terraform + AWS (15) | VPC + EKS provisioning; cost controls; teardown docs. |
| Kubernetes + Helm (15) | Charts, ConfigMaps/Secrets, probes, resources, Ingress, HPA. |
| Prometheus + Grafana (10) | Scrape `/metrics`; request/error/latency panels; business counters. |
| Presentation + Documentation (5) | Architecture diagram, setup guide, demo script, teardown procedure. |

---

## 14. Implementation Roadmap

See `CLAUDE.md` milestones (M1–M19) for the ordered task list with definitions of done.

---

## 15. Decisions Locked for MVP

- Auth and database: Supabase (Auth + PostgreSQL).
- Home and Dashboard are the same page; visible nav label is Home.
- Dark-only theme; no light-mode toggle.
- Individual YouTube video URL and playlist import both in scope.
- Playback uses YouTube IFrame Player API; no downloads or scraping.
- Typed notes in scope; Upload Notes = Coming Soon modal only.
- Comments separate from the primary note document.
- Playback progress and learning status are separate fields.
- Manual status controls coexist with automatic playback tracking.
- NEEDS_REVISION does not erase completion history.
- Right workspace: Notes, Comments, Progress tabs; Playlist drawer replaces while open.
- Progress tab shows both current-video progress and full-path standing.
- Saved Videos = explicit bookmark library, independent of path membership.
- AI notes, handwriting, file uploads, collaboration, advanced spaced repetition: deferred.
