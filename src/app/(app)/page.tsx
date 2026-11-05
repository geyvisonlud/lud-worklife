import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Agenda } from "@/components/Agenda";
import { EmailSuggestions } from "@/components/EmailSuggestions";
import { DailyInspiration } from "@/components/DailyInspiration";
import { STOIC_QUOTES, VERSES } from "@/lib/daily-content";
import { stoicOfDay, verseOfDay } from "@/lib/daily";
import { gmailLink, hasGmailScope } from "@/lib/email";
import { QuickAdd, TaskRow } from "@/components/TaskBits";
import { Card, NotionMark, ProgressBar, ProjectGlyph, StatStrip, notionReasonLabel } from "@/components/ui";
import { projectColor } from "@/lib/colors";
import { prisma } from "@/lib/db";
import { addDays, appTimeZone, dayBounds, formatDay, formatDuration, greeting, relativeTime } from "@/lib/dates";
import { eventsBetween, listProjects, listTasks, today } from "@/lib/data";
import { ownerFirstName } from "@/lib/session";
import { daySummary, groupTasks } from "@/lib/tasks";

export default async function TodayPage() {
  const tz = appTimeZone();
  const day = today();
  const [events, tasks, projects, name, calendars, notion] = await Promise.all([
    eventsBetween(day, addDays(day, 1)),
    listTasks({ OR: [{ status: { not: "done" } }, { completedAt: { gte: new Date(Date.now() - 86400_000) } }] }),
    listProjects(),
    ownerFirstName(),
    prisma.calendar.findMany({ select: { id: true, name: true } }),
    prisma.notionConnection.findFirst({ orderBy: { lastSyncedAt: "desc" } }),
  ]);
  const [suggestions, mailAccounts] = await Promise.all([
    prisma.emailSuggestion.findMany({ where: { status: "pending", account: { emailEnabled: true } }, include: { account: { select: { email: true } } }, orderBy: [{ priority: "desc" }, { receivedAt: "desc" }], take: 12 }),
    prisma.calendarAccount.findMany({ select: { provider: true, scopes: true, emailEnabled: true, lastEmailScanAt: true } }),
  ]);
  const saved = await prisma.savedQuote.findMany({ select: { kind: true, key: true } });
  const stoic = stoicOfDay(day);
  const verse = verseOfDay(day);
  const canScan = mailAccounts.some((a) => a.provider === "google" && a.emailEnabled && hasGmailScope(a.scopes));
  const lastScan = mailAccounts.reduce<Date | null>((m, a) => (a.lastEmailScanAt && (!m || a.lastEmailScanAt > m) ? a.lastEmailScanAt : m), null);
  // Today's events only (eventsBetween is padded by a day for time zones).
  const [d0, d1] = dayBounds(day, tz);
  const todaysEvents = events.filter((e) =>
    e.allDay ? e.start.slice(0, 10) <= day && (e.end.slice(0, 10) > day || e.end.slice(0, 10) === e.start.slice(0, 10)) : new Date(e.start) < d1 && new Date(e.end) > d0,
  );
  const g = groupTasks(tasks, day, tz);
  const blocks = tasks.filter((t) => t.scheduledStart && new Date(t.scheduledStart) >= d0 && new Date(t.scheduledStart) < d1);
  const sum = daySummary(
    tasks,
    todaysEvents.filter((e) => !e.declined).map((e) => ({ start: new Date(e.start), end: new Date(e.end), allDay: e.allDay })),
    day,
    tz,
  );
  const active = projects.filter((p) => p.stage === "active");
  const fromNotion = projects.filter((p) => p.source === "notion").slice(0, 5);
  const calNames = Object.fromEntries(calendars.map((c) => [c.id, c.name]));
  const focusList = [...g.overdue, ...g.today];

  return (
    <div className="space-y-5">
      <header className="animate-in flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="label-mono mb-2">{formatDay(day, { long: true, year: true })}</div>
          <h1 className="title-xl">
            {greeting(new Date(), tz)}
            {name ? `, ${name}` : ""}
          </h1>
        </div>
        <Link href="/calendar" className="btn btn-secondary">
          Plan the week <ArrowRight size={14} />
        </Link>
      </header>

      <DailyInspiration
        stoicIndex={STOIC_QUOTES.indexOf(stoic)}
        verseIndex={VERSES.indexOf(verse)}
        saved={saved.map((s) => `${s.kind}:${s.key}`)}
      />

      <StatStrip
        items={[
          { label: "Tasks today", value: String(sum.dueToday), hint: sum.inbox ? `${sum.inbox} in the inbox` : "Inbox zero" },
          { label: "Overdue", value: String(sum.overdue), tone: sum.overdue ? "bad" : undefined, hint: sum.overdue ? "Reschedule or finish" : "All caught up" },
          { label: "Meetings", value: sum.meetingMin ? formatDuration(sum.meetingMin) : "None", hint: `${sum.events} event${sum.events === 1 ? "" : "s"} today` },
          { label: "Focus blocks", value: sum.focusMin ? formatDuration(sum.focusMin) : "None", tone: sum.focusMin ? "good" : undefined, hint: "Tasks on the calendar" },
        ]}
      />

      <EmailSuggestions
        items={suggestions.map((s) => ({
          id: s.id,
          title: s.title ?? s.subject,
          reason: s.reason,
          dueDate: s.dueDate,
          priority: s.priority,
          fromName: s.fromName,
          fromEmail: s.fromEmail,
          subject: s.subject,
          receivedAt: s.receivedAt.toISOString(),
          link: gmailLink(s.account.email, s.threadId),
          account: s.account.email,
          source: s.source,
        }))}
        canScan={canScan}
        lastScan={lastScan?.toISOString() ?? null}
        multipleAccounts={new Set(suggestions.map((s) => s.accountId)).size > 1}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Card title="Agenda" href="/calendar">
          <Agenda events={todaysEvents} tasks={blocks} calendars={calNames} />
        </Card>
        <Card title="To do today" href="/tasks">
          <QuickAdd placeholder="Add a task for today…" dueToday />
          <div className="mt-2">
            {focusList.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
            {!focusList.length && <p className="py-6 text-center text-[14px] text-ink-2">Nothing due today. Pick something from the inbox?</p>}
          </div>
          {g.inbox.length > 0 && (
            <>
              <div className="section-label mb-1 mt-4">Inbox · {g.inbox.length}</div>
              {g.inbox.slice(0, 4).map((t) => (
                <TaskRow key={t.id} task={t} compact />
              ))}
            </>
          )}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card title="Projects in progress" href="/projects">
          {active.length ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {active.map((p) => {
                const pct = p.taskCount ? p.doneCount / p.taskCount : 0;
                return (
                  <li key={p.id}>
                    <Link href={`/projects/${p.id}`} className="row-button flex items-center gap-3 p-2">
                      <ProjectGlyph emoji={p.emoji} color={p.color} size={38} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14.5px] font-medium">{p.name}</div>
                        <div className="mt-1.5">
                          <ProgressBar pct={pct} color={projectColor(p.color).hex} />
                        </div>
                        <div className="num mt-1 text-[11.5px] text-ink-2">
                          {p.doneCount}/{p.taskCount} tasks · {Math.round(pct * 100)}%
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-6 text-center text-[14px] text-ink-2">No project in progress.</p>
          )}
        </Card>
        <Card title="From Notion" href="/connections">
          {fromNotion.length ? (
            <ul>
              {fromNotion.map((p) => (
                <li key={p.id} className="list-row">
                  <Link href={`/projects/${p.id}`} className="flex items-center gap-3 py-2.5">
                    <ProjectGlyph emoji={p.emoji} color={p.color} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-medium">{p.name}</div>
                      <div className="truncate text-[12px] text-ink-2">
                        {notionReasonLabel(p.notionReason)}
                        {p.notionParent ? ` · ${p.notionParent}` : ""}
                      </div>
                    </div>
                    {p.notionStatus && <span className="chip shrink-0">{p.notionStatus}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="py-6 text-center text-[14px] text-ink-2">
              <NotionMark size={22} className="mx-auto mb-2 text-ink-3" />
              {notion ? "No pages mention you yet." : "Connect Notion to import the pages where you're mentioned or assigned."}
              {!notion && (
                <div className="mt-3">
                  <Link href="/connections" className="btn btn-secondary">
                    Connect Notion
                  </Link>
                </div>
              )}
            </div>
          )}
          {fromNotion.length > 0 && notion?.lastSyncedAt && (
            <p className="mt-2 text-[11.5px] text-ink-3">
              Imported automatically from {notion.workspaceName} · checked {relativeTime(notion.lastSyncedAt)}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
