import { CalendarView, type CalView } from "@/components/CalendarView";
import { prisma } from "@/lib/db";
import { addDays, isYmd, startOfWeek } from "@/lib/dates";
import { calendarTasks, eventsBetween, listCalendars, today } from "@/lib/data";
import { getSettings } from "@/lib/settings";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string }> }) {
  const sp = await searchParams;
  const view: CalView = sp.view === "day" || sp.view === "3day" ? sp.view : "week";
  const anchor = isYmd(sp.date) ? sp.date : today();
  const { weekStart } = await getSettings();
  const first = view === "week" ? startOfWeek(anchor, weekStart) : anchor;
  const n = view === "week" ? 7 : view === "3day" ? 3 : 1;
  const days = Array.from({ length: n }, (_, i) => addDays(first, i));
  const [events, tasks, calendars, accounts] = await Promise.all([
    eventsBetween(days[0], addDays(days[n - 1], 1)),
    calendarTasks(days[0], addDays(days[n - 1], 1)),
    listCalendars(),
    prisma.calendarAccount.count(),
  ]);
  return (
    <CalendarView
      key={`${view}-${first}`}
      days={days}
      view={view}
      anchor={anchor}
      events={events}
      tasks={tasks}
      calendars={calendars}
      hasAccounts={accounts > 0}
      explicitView={Boolean(sp.view)}
    />
  );
}
