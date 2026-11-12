import { addDays, daysBetween, ymdInTz } from "./dates";

export type TaskLike = {
  id: string;
  status: string;
  dueDate: string | null;
  scheduledStart: Date | string | null;
  durationMin: number;
  priority: number;
  position: number;
};

/** The local day a task "belongs to": its time block, else its due date. */
export function taskDay(t: Pick<TaskLike, "dueDate" | "scheduledStart">, tz: string) {
  if (t.scheduledStart) return ymdInTz(new Date(t.scheduledStart), tz);
  return t.dueDate;
}

export type Bucket = "overdue" | "today" | "upcoming" | "inbox" | "done";

/**
 * Where a task shows in the Tasks list:
 * done · overdue (past due/scheduled and not done) · today · upcoming · inbox (no date at all).
 */
export function bucketOf(t: TaskLike, today: string, tz: string): Bucket {
  if (t.status === "done") return "done";
  const day = taskDay(t, tz);
  if (!day) return "inbox";
  // A task scheduled earlier today is still "today"; a due date before today is overdue.
  const due = t.dueDate && daysBetween(today, t.dueDate) < 0;
  const d = daysBetween(today, day);
  if (d === 0 && !due) return "today";
  if (d < 0 || due) return "overdue";
  return "upcoming";
}

export const BUCKETS: { key: Bucket; label: string }[] = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "inbox", label: "Inbox" },
  { key: "done", label: "Done" },
];

/** Sort within a list: scheduled time, then priority (high first), then manual order. */
export function compareTasks(a: TaskLike, b: TaskLike) {
  const sa = a.scheduledStart ? new Date(a.scheduledStart).getTime() : Infinity;
  const sb = b.scheduledStart ? new Date(b.scheduledStart).getTime() : Infinity;
  if (sa !== sb) return sa - sb;
  if (a.dueDate !== b.dueDate) return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
  return b.priority - a.priority || a.position - b.position;
}

export function groupTasks<T extends TaskLike>(tasks: T[], today: string, tz: string) {
  const out: Record<Bucket, T[]> = { overdue: [], today: [], upcoming: [], inbox: [], done: [] };
  for (const t of tasks) out[bucketOf(t, today, tz)].push(t);
  for (const k of Object.keys(out) as Bucket[]) out[k].sort(compareTasks);
  return out;
}

/** Figures for the Today strip. */
export function daySummary(tasks: TaskLike[], events: { start: Date; end: Date; allDay: boolean }[], today: string, tz: string) {
  const g = groupTasks(tasks, today, tz);
  const scheduledToday = tasks.filter((t) => t.status !== "done" && t.scheduledStart && ymdInTz(new Date(t.scheduledStart), tz) === today);
  const timed = events.filter((e) => !e.allDay);
  const meetingMin = timed.reduce((s, e) => s + Math.max(0, (e.end.getTime() - e.start.getTime()) / 60000), 0);
  const focusMin = scheduledToday.reduce((s, t) => s + t.durationMin, 0);
  return {
    dueToday: g.today.length,
    overdue: g.overdue.length,
    inbox: g.inbox.length,
    events: timed.length,
    meetingMin: Math.round(meetingMin),
    focusMin,
  };
}

/** Quick-add parsing: "Write report tomorrow !high 45m" → title + due date + priority + duration. */
export function parseQuickAdd(input: string, today: string) {
  let title = ` ${input.trim()} `;
  let dueDate: string | null = null;
  let priority = 0;
  let durationMin: number | null = null;
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    const m = title.match(re);
    if (m) {
      fn(m);
      title = title.replace(re, " ");
    }
  };
  take(/\s!(high|h|3)\b/i, () => (priority = 3));
  take(/\s!(medium|med|m|2)\b/i, () => (priority = 2));
  take(/\s!(low|l|1)\b/i, () => (priority = 1));
  take(/\s(\d{1,3})\s?(m|min|mins)\b/i, (m) => (durationMin = Number(m[1])));
  take(/\s(\d(?:\.\d)?)\s?(h|hr|hrs|hours?)\b/i, (m) => (durationMin = Math.round(Number(m[1]) * 60)));
  take(/\s(today|tod)\b/i, () => (dueDate = today));
  take(/\s(tomorrow|tmr|tom)\b/i, () => (dueDate = addDays(today, 1)));
  take(/\s(\d{4}-\d{2}-\d{2})\b/, (m) => (dueDate = m[1]));
  return { title: title.replace(/\s+/g, " ").trim(), dueDate, priority, durationMin };
}

/* ------------------------------------------------------- board toolbar */

export type BoardFilter = {
  q: string;
  /** "" = any, or "0".."3". */
  priority: string;
  /** "" = all projects, "none" = no project, or a project id. */
  project: string;
  due: "" | "overdue" | "today" | "week" | "none";
  sort: "manual" | "due" | "priority";
};
export const EMPTY_FILTER: BoardFilter = { q: "", priority: "", project: "", due: "", sort: "manual" };

type BoardTask = { title: string; notes: string | null; priority: number; projectId: string | null; dueDate: string | null; status: string; position: number };

/** The board toolbar: search, priority, project and due filters, then the sort (manual = the board's own order). */
export function filterBoardTasks<T extends BoardTask>(tasks: T[], f: BoardFilter, today: string, projectName: (id: string) => string = () => "") {
  const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  const weekEnd = addDays(today, 6);
  const out = tasks.filter((t) => {
    if (words.length) {
      const hay = `${t.title} ${t.notes ?? ""} ${t.projectId ? projectName(t.projectId) : ""}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) return false;
    }
    if (f.priority && t.priority !== Number(f.priority)) return false;
    if (f.project === "none" ? t.projectId !== null : f.project && t.projectId !== f.project) return false;
    if (f.due === "none" && t.dueDate) return false;
    if (f.due === "overdue" && !(t.dueDate && t.dueDate < today && t.status !== "done")) return false;
    if (f.due === "today" && t.dueDate !== today) return false;
    if (f.due === "week" && !(t.dueDate && t.dueDate <= weekEnd && (t.dueDate >= today || t.status !== "done"))) return false;
    return true;
  });
  const sorted = [...out];
  if (f.sort === "due") sorted.sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || b.priority - a.priority || a.position - b.position);
  else if (f.sort === "priority") sorted.sort((a, b) => b.priority - a.priority || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.position - b.position);
  return sorted;
}

/** Figures for the board header: open, overdue, due this week (next 7 days, today included). */
export function boardStats(tasks: { status: string; dueDate: string | null }[], today: string) {
  const open = tasks.filter((t) => t.status !== "done");
  const weekEnd = addDays(today, 6);
  return {
    open: open.length,
    overdue: open.filter((t) => t.dueDate && t.dueDate < today).length,
    week: open.filter((t) => t.dueDate && t.dueDate >= today && t.dueDate <= weekEnd).length,
  };
}

/** The flag on a card: "Today", "Tomorrow", "Yesterday" or "Nov 20" (with the year when it isn't this year). */
export function flagDate(day: string, today: string) {
  const diff = daysBetween(today, day);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  const [y, m, d] = day.split("-").map(Number);
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1];
  return `${mon} ${d}${String(y) !== today.slice(0, 4) ? `, ${y}` : ""}`;
}
