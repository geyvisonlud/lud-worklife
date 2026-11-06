import { Sidebar, TabBar } from "@/components/Nav";
import { WorkProvider } from "@/components/TaskSheet";
import { Main } from "@/components/Main";
import { authEnabled } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { appTimeZone, relativeTime } from "@/lib/dates";
import { today } from "@/lib/data";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const day = today();
  const [projects, overdue, settings, accounts, notion] = await Promise.all([
    prisma.project.findMany({ where: { archived: false }, select: { id: true, name: true, emoji: true, color: true }, orderBy: [{ stage: "asc" }, { position: "asc" }] }),
    prisma.task.count({ where: { status: { not: "done" }, dueDate: { lt: day } } }),
    getSettings(),
    prisma.calendarAccount.findMany({ select: { lastSyncedAt: true, status: true } }),
    prisma.notionConnection.findMany({ select: { lastSyncedAt: true, status: true } }),
  ]);
  const target = settings.taskCalendarId ? await prisma.calendar.findUnique({ where: { id: settings.taskCalendarId }, select: { name: true } }) : null;
  const latest = (rows: { lastSyncedAt: Date | null }[]) =>
    rows.reduce<Date | null>((m, r) => (r.lastSyncedAt && (!m || r.lastSyncedAt > m) ? r.lastSyncedAt : m), null);
  const sync = [
    ...(accounts.length ? [{ label: `Calendars ${latest(accounts) ? relativeTime(latest(accounts)!) : "not synced"}`, ok: accounts.every((a) => a.status === "OK") }] : []),
    ...(notion.length ? [{ label: `Notion ${latest(notion) ? relativeTime(latest(notion)!) : "not synced"}`, ok: notion.every((n) => n.status === "OK") }] : []),
  ];
  return (
    <WorkProvider tz={appTimeZone()} today={day} projects={projects} defaultDuration={settings.defaultDuration} googleTarget={target?.name ?? null}>
      <Sidebar badges={{ "/tasks": overdue }} authEnabled={authEnabled()} sync={sync} />
      <TabBar badges={{ "/tasks": overdue }} />
      <Main>{children}</Main>
    </WorkProvider>
  );
}
