# Lud Worklife — notes for Claude

Personal productivity dashboard for one person (Next.js 15 App Router + Prisma/PostgreSQL + Tailwind 4), sister app of
Lud Finances (`geyvisonlud/financedashboard`) with the same design system. The owner is Brazilian and talks in
**Portuguese**; the **app UI is in English**. Reply to the owner in Portuguese, keep all UI copy in English.

## Run it

```bash
npm install
npm run setup      # once: .env, built-in PostgreSQL (.pgdata/, port 5433), migrations, demo data
npm run dev        # starts the DB + app → http://localhost:3000
npm run db:studio
```

Google and Notion are **not configured locally**; the seed creates `provider: "demo"` calendar accounts and a `method: "demo"`
Notion workspace that the sync code skips. Work on features and visuals with the demo data.

## Checks before committing

```bash
npm run typecheck
npm test
```

Look at UI changes in the browser (light **and** dark mode, ~390px width). Test drag and drop for Kanban/calendar changes.

## Where things are

- `src/app/(app)/*` — pages: today (`page.tsx`), tasks, calendar, notes, read-later, habits, habits/[id], bible, projects, projects/[id], saved, connections
- `src/app/actions.ts` — all server actions; return `ActionResult` (`{ ok: true, message? } | { ok: false, error }`), shown as toasts by `useReport()`
- `src/components/TaskSheet.tsx` — `WorkProvider` (tz, today, projects, the single task editor, toasts) — open the editor with `useWork().openTask(task, defaults)`
- `src/components/Kanban.tsx` — generic board + `ProjectBoard` / `TaskBoard`; `CalendarView.tsx` — grid, tray, drag/resize
- `src/lib/` — pure tested logic (`dates`, `calendar-layout`, `kanban`, `colors`, `google`, `notion`, `tasks`) and I/O (`google-sync`, `notion-sync`, `data` loaders + DTOs)

## Conventions

- Design tokens in `src/app/globals.css` (copied from Lud Finances — keep them in sync). Use Tailwind aliases, never hard-coded
  colors — except calendar/project colors, which are data (`lib/colors.ts`) and are mixed with `color-mix(… var(--surface))`.
- Days are `YYYY-MM-DD` strings in `APP_TIMEZONE`; instants are `Date`. Use `lib/dates.ts` (`zonedToUtc`, `ymdInTz`,
  `wallMinutes`) — never `new Date().getHours()`. All-day events are stored at UTC midnight of their date.
- Kanban order: fractional `position` (`positionAt`), only the moved card is rewritten.
- Boards (Tasks, Projects, a project's tasks) share `Board` in `Kanban.tsx`: lanes with dot/name/count/⋯ menu (rename, color, move
  left/right, hide built-in / delete custom), "+ Add" on top, cards with priority pill, project, title, description, checklist
  segments (`checklist`/`cardDescription` parse "- [ ]" lines in task notes), due flag; "Show N more" after 6; "+ Add column" and
  "Hidden columns" at the end; a card's ⋯ menu moves it (phones). Columns: `BoardColumn` rows (board tasks|projects) merged with the
  built-ins by `mergeColumns` (built-ins get a row only when changed; custom keys "c_…"; Done can't be hidden; deleting a custom
  column moves its cards to To do / Planned). Status/stage validation = `isColumnOf` (built-in or existing custom key). Columns are in
  `useWork().taskColumns/projectColumns` — label any status with `columnLabel`. Tasks opens on Board (`?view=list` for the list);
  toolbar filters/sort are client-side (`filterBoardTasks`, `boardStats`, `flagDate` in lib/tasks.ts, tested). The sidebar lists
  projects that aren't done (open task counts, + new project).
- Archive: done tasks can be archived (`Task.archivedAt`; `archiveTasks`, `archiveDoneTasks`, `unarchiveTask`) from a card's ⋯,
  the Done column's ⋯ ("Archive done tasks") or the list's Done card. Archived tasks are hidden everywhere (`listTasks` and
  `calendarTasks` skip them unless asked) but still count in project progress; Tasks → Archived (`?view=archived`) restores or
  deletes them. Reopening a task (status ≠ done, here or from Google Tasks) clears `archivedAt`.
- Google colors: store the *current* palette color (`googleCalendarColor`); `customColor` is a local override.
- Task time blocks mirrored to Google carry `extendedProperties.private.ludTaskId`; `mapEvent` skips them so they aren't shown twice.
- Notion: read-only. `importPage` decides by `assignedVia` (People property) or `@mention`; `stageOverridden` stops Notion's
  status from moving a card the user moved.
- Tokens (Google, Notion) are encrypted with `lib/crypto.ts`.
- Email → possible tasks: `lib/email.ts` (parse, `screen` drops marketing/automated mail, keyword fallback), `lib/email-ai.ts`
  (Claude `claude-opus-5-5`, structured output, emails passed as data in `<email>` tags), `lib/email-sync.ts` (Gmail, read-only).
  Every analyzed email is stored in `EmailSuggestion` (pending/accepted/dismissed/none/skipped) so it's never analyzed twice.
  Keep marketing filtering in `screen` (cheap, tested) rather than in the prompt.
- Today: `DayOverview` comes first (greeting in Geist sans (no serif on Today), now/next, the day ribbon — today's events in calendar colors and hatched focus
  blocks on one line with a now marker — and the day's figures; math in `lib/day-overview.ts`, tested), then `HabitStrip` (story-style emoji circles, no names; hold ~0.65 s until the ring closes to check off, hold again to undo — a tap does nothing; the dock keeps tap-to-check rows), then
  `ProjectCards` (colored gradient cards: in progress → planned → on hold, 3 on desktop / swipe on phones) and `TaskTable` (Notion-style
  table of open tasks: All / In projects / No project; logic in `lib/work-overview.ts`, tested), then two independent columns (Agenda + email | To do + Bible + Notes), From Notion, quotes.
- Google Tasks: two-way (`lib/google-tasks.ts` pure + tested, `lib/google-tasks-sync.ts` I/O). Lists in `GoogleTaskList` (toggle per list on
  Connections); open tasks are imported, then changes since `lastSyncedAt` (deletions too) are pulled. Edits here (title, notes, due date,
  done) are pushed by the task actions; `Task.googleTaskUpdated` keeps our own writes from being pulled back. Google has no time,
  priority or project — those stay local. Pulled with the calendar sync and by `GoogleTasksAutoSync` on Today/Tasks.
- Notes (own notes — Google Keep has no API for personal accounts): `Note` (Markdown `body`, `tags` String[] lowercase without
  "#", `pinned`, optional `NoteFolder` — folders nest via `parentId`; `folderTree`/`folderAndDescendants`/`canMoveFolder` in lib/notes.ts; a folder lists its subfolders' notes too; deleting one moves its notes and subfolders up a level), listed by `updatedAt` (last edited/added first). Pure helpers in `lib/notes.ts` (tags,
  title from first line, excerpt, `#tag` search syntax, `mailtoHref` for e-mail sharing — plain text), loaders in `lib/notes-data.ts`.
  `/notes` = folders/tags sidebar, list, editor (autosave ~0.7 s, Edit/Preview, checklist boxes toggle the source line);
  `NotesBox` on Today (6 latest + search via `findNotes`). Markdown is rendered with react-markdown + remark-gfm (no raw HTML).
  Desktop is Notion-like and full width (`Main` is wide on /notes, no habit dock there): a sticky sidebar with search, All notes,
  Pinned, the folder tree (Inbox + folders, each expandable to its notes; open/closed in localStorage `lw:notes-tree`) and tags;
  the right side is the open note as a full-width page (Esc / ✕ closes) or the collection as a Notion-style table or boxes.
  Notes without a folder are the **Inbox** (`?folder=none`). Two collection views, remembered in localStorage `lw:notes-view`: list/table and boxes (masonry cards). `Note.color` is a PROJECT_COLORS key
  (tinted card/editor via `noteTint`). "Make it a project" (`noteToProject`, sets `Note.projectId`) and "Add to calendar…"
  (`noteToEvent`: any writable calendar; Google calendars get the event in Google too; `noteEvent` in lib/notes.ts builds it).
- Calendar layout is Fantastical-like: views Day / Week / Month / Year (`?view=`, 3day still works by URL), red active tab and today.
  Desktop sidebar = `MiniMonth` (busy dots, browsable) + event search + `AgendaList` (TODAY / TOMORROW / weekday headers, all-day
  pills, Join for meet links, task time blocks), then collapsible Unscheduled and Calendars. Month = `MonthGrid` (all-day bars,
  dot + title + time rows, "N more…" → day view, double-click = new event); Year = `YearGrid`. Phones open on Month = big mini month +
  agenda from the tapped day; Day view on phones has a week strip. Components in `CalendarPanels.tsx`, math in `lib/calendar-month.ts`
  (tested). The page loads this month ± 1 plus 3 weeks ahead (the whole year in Year).
- Calendar: drag with the mouse on an empty part of a day to select start → end (`dragRange`, 15-min snap; a plain click = 1 h
  at the half hour; a tap on phones does the same, touch-drag scrolls). It opens `NewItemSheet` — **Event by default** (writable
  calendar, last used remembered in localStorage `lw:last-calendar`; `createEvent` → Google for Google calendars + a local Event row
  so it shows before the next sync; times built by `buildEvent` in lib/events.ts) or Task (time block / due day). "New" in the
  toolbar does the same; double-click a day header for an all-day event.
  Adding to a calendar that's hidden here turns it on (otherwise the event wouldn't show). Click an event → Edit (same sheet,
  calendar locked) → `updateEvent` (PATCH in Google) or delete → `deleteEvent`; only on writable calendars; for a repeating event
  only that occurrence changes.
- Read Later (`/read-later`, separate from Notes): `ReadItem` (link with fetched title/description/og:image, or plain text;
  `url` normalized + unique so re-saves don't duplicate; `source` web/instagram/x/youtube/text; `via` phone/app/import; unread/read).
  Phone capture: `POST /api/capture` (excluded from the session middleware) with `Authorization: Bearer <captureToken>` (Setting,
  created/reset on the page) and JSON/form/text `url`/`text`/`title` — made for an iOS Shortcut in the share sheet (works from
  Chrome, Safari and any app). Desktop Chrome: a bookmarklet opens `/read-later?add=<url>`, which saves it and cleans the address. Imports: any
  JSON/HTML/text export (Instagram saved_posts.json, Chrome ReadingList Takeout, bookmarks .html) via `extractLinks`. Pure logic and
  tests in `lib/read-later.ts`; I/O (fetchMeta, save, import, token) in `lib/read-later-data.ts`. X bookmarks have no free export.
  Page is full width: Keep-style masonry cards (image on top), "Phone & import" setup panel toggled from the toolbar. Clicking a
  card opens the **Print view** on the right (full screen on phones): `readerView` fetches the page once, Readability (`lib/reader.ts`,
  linkedom) extracts the article and `sanitizeArticle` rebuilds it with allow-listed tags only before it's stored in
  `ReadItem.content` and rendered as HTML (`.reader` styles). "Save to notes" (`saveReadItemToNotes`) makes an Inbox note tagged
  #read-later with the link and the article as Markdown (turndown).
- Notifications (Web Push — iPhone Home Screen app on iOS 16.4+, desktop browsers): `public/sw.js` (shows pushes, opens the
  url on tap; registered on every page by `RegisterServiceWorker`), `PushSubscription` per device, VAPID keys generated once and
  kept in Settings (private key encrypted). `NotificationsCard` on Connections turns it on per device + preferences (Setting
  `notifyPrefs`: events, task time blocks, lead minutes, morning digest + time). `GET /api/cron/notify` (CRON_SECRET) runs
  `runReminders` → `dueReminders` (pure, `lib/notify.ts`, tested); `NotificationLog` keys make each reminder send once. Called
  every 5 min by `.github/workflows/notify.yml` (repo secrets APP_URL + CRON_SECRET).
- Phone tab bar: Today, Tasks, Calendar, Notes, More (Projects, Read Later, Habits, Bible, Saved, Connections).
- Habits: `lib/habits.ts` (pure, tested) — daily goals count streaks in days, weekly goals (N×/week) in weeks that met the
  goal; an unfinished today/this week never breaks a streak. A check is one `HabitCheck` row per habit per day (YYYY-MM-DD).
  `HabitDock` (floating, all pages except Today and /habits) remembers minimized/open in localStorage (`lw:habit-dock`).
- Bible plan: a reading guide only (the owner reads a physical Bible) — `lib/bible-books.ts` (66 books, chapter counts, original
  intros), `lib/bible-plan.ts` (pure, tested: two tracks, even split over 365 days, start date in Setting `biblePlanStart`, read
  days in `BibleDay`). No Bible text, no study notes and no Claude calls here.
- Daily thought/verse: content in `lib/daily-content.ts` (stable ids — saved quotes point to them; append, never renumber),
  pick in `lib/daily.ts` (fixed per day, coprime stride so no repeats within a cycle). Saving copies the text into `SavedQuote`.
- Database URL: `lib/db.ts` and `scripts/db-env.mjs` accept the names Vercel's Neon integration adds (`POSTGRES_URL`, …).
- Put new logic in a pure function in `src/lib/` with a `*.test.ts` next to it.
- **Schema changes:** edit `schema.prisma`, then `npx prisma migrate dev --name <change>` with the DB running. Never edit existing migrations.
- Never run `npm run db:seed` against a remote database — it wipes everything.

## Git

Work on a branch and open a PR; commit messages in English, describing the user-visible change.
