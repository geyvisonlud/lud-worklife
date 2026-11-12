import { CalendarView, type CalView } from "@/components/CalendarView";
import { prisma } from "@/lib/db";
import { addDays, isYmd, startOfWeek } from "@/lib/dates";
import { calendarTasks, eventsBetween, listCalendars, today } from "@/lib/data";
import { addMonths, monthWeeks } from "@/lib/calendar-month";
import { getSettings } from "@/lib/settings";

const VIEWS: CalView[] = ["day", "3day", "week", "month", "year"];

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string }> }) {
  const sp = await searchParams;
  const view: CalView = VIEWS.includes(sp.view as CalView) ? (sp.view as CalView) : "week";
  const anchor = isYmd(sp.date) ? sp.date : today();
  const { weekStart } = await getSettings();
  const first = view === "week" ? startOfWeek(anchor, weekStart) : anchor;
  const n = view === "week" ? 7 : view === "3day" ? 3 : 1;
  // Time grid days (day / 3 days / week); month and year draw their own grids.
  const days = view === "month" || view === "year" ? [] : Array.from({ length: n }, (_, i) => addDays(first, i));
  // Loaded range: the view, the mini calendar (this month ± 1) and the agenda (3 weeks ahead).
  const prev = monthWeeks(addMonths(anchor, -1), weekStart, true);
  const next = monthWeeks(addMonths(anchor, 1), weekStart, true);
  const bounds = [prev[0][0], next[5][6], anchor, addDays(anchor, 21), ...days];
  if (view === "year") bounds.push(`${anchor.slice(0, 4)}-01-01`, `${anchor.slice(0, 4)}-12-31`);
  const from = bounds.reduce((a, b) => (a < b ? a : b));
  const to = addDays(bounds.reduce((a, b) => (a > b ? a : b)), 1);
  const [events, tasks, calendars, accounts] = await Promise.all([eventsBetween(from, to), calendarTasks(from, to), listCalendars(), prisma.calendarAccount.count()]);
  return (
    <CalendarView
      key={`${view}-${view === "month" ? anchor.slice(0, 7) : view === "year" ? anchor.slice(0, 4) : first}`}
      days={days}
      view={view}
      anchor={anchor}
      weekStart={weekStart}
      events={events}
      tasks={tasks}
      calendars={calendars}
      hasAccounts={accounts > 0}
      explicitView={Boolean(sp.view)}
    />
  );
}
