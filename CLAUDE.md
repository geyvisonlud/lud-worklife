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

- `src/app/(app)/*` — pages: today (`page.tsx`), tasks, calendar, projects, projects/[id], connections
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
- Google colors: store the *current* palette color (`googleCalendarColor`); `customColor` is a local override.
- Task time blocks mirrored to Google carry `extendedProperties.private.ludTaskId`; `mapEvent` skips them so they aren't shown twice.
- Notion: read-only. `importPage` decides by `assignedVia` (People property) or `@mention`; `stageOverridden` stops Notion's
  status from moving a card the user moved.
- Tokens (Google, Notion) are encrypted with `lib/crypto.ts`.
- Email → possible tasks: `lib/email.ts` (parse, `screen` drops marketing/automated mail, keyword fallback), `lib/email-ai.ts`
  (Claude `claude-opus-5-5`, structured output, emails passed as data in `<email>` tags), `lib/email-sync.ts` (Gmail, read-only).
  Every analyzed email is stored in `EmailSuggestion` (pending/accepted/dismissed/none/skipped) so it's never analyzed twice.
  Keep marketing filtering in `screen` (cheap, tested) rather than in the prompt.
- Database URL: `lib/db.ts` and `scripts/db-env.mjs` accept the names Vercel's Neon integration adds (`POSTGRES_URL`, …).
- Put new logic in a pure function in `src/lib/` with a `*.test.ts` next to it.
- **Schema changes:** edit `schema.prisma`, then `npx prisma migrate dev --name <change>` with the DB running. Never edit existing migrations.
- Never run `npm run db:seed` against a remote database — it wipes everything.

## Git

Work on a branch and open a PR; commit messages in English, describing the user-visible change.
