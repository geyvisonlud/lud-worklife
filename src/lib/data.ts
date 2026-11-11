import type { Calendar, CalendarAccount, Event, Prisma, Project, Task } from "@prisma/client";
import { prisma } from "./db";
import { addDays, appTimeZone, dayBounds, ymdInTz } from "./dates";
import type { SimpleBlock } from "./notion";
import { summarize } from "./habits";
import { SETTING_KEYS, getSetting, getSettings } from "./settings";
import { nextUnread, planDay, progress, readingFor } from "./bible-plan";

/* ----------------------------------------------------------- client DTOs */

export type TaskDTO = {
  id: string;
  title: string;
  notes: string | null;
  projectId: string | null;
  status: string;
  priority: number;
  position: number;
  dueDate: string | null;
  durationMin: number;
  scheduledStart: string | null;
  fromNotion: boolean;
  /** Linked to a Google Tasks task (two-way). */
  fromGoogleTasks: boolean;
  inGoogle: boolean;
  completedAt: string | null;
};

export type ProjectDTO = {
  id: string;
  name: string;
  description: string | null;
  emoji: string | null;
  color: string;
  stage: string;
  position: number;
  dueDate: string | null;
  source: string;
  notionUrl: string | null;
  notionParent: string | null;
  notionStatus: string | null;
  notionReason: string | null;
  taskCount: number;
  doneCount: number;
};

export type CalendarDTO = { id: string; name: string; color: string; accountEmail: string; visible: boolean; canWrite: boolean; primary: boolean };

export type EventDTO = {
  id: string;
  calendarId: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  color: string;
  location: string | null;
  description: string | null;
  htmlLink: string | null;
  meetLink: string | null;
  declined: boolean;
};

export const taskDTO = (t: Task): TaskDTO => ({
  id: t.id,
  title: t.title,
  notes: t.notes,
  projectId: t.projectId,
  status: t.status,
  priority: t.priority,
  position: t.position,
  dueDate: t.dueDate,
  durationMin: t.durationMin,
  scheduledStart: t.scheduledStart?.toISOString() ?? null,
  fromNotion: Boolean(t.notionBlockId),
  fromGoogleTasks: Boolean(t.googleTaskId && t.googleTaskListId),
  inGoogle: Boolean(t.googleEventId),
  completedAt: t.completedAt?.toISOString() ?? null,
});

export const projectDTO = (p: Project & { tasks?: { status: string }[] }): ProjectDTO => ({
  id: p.id,
  name: p.name,
  description: p.description,
  emoji: p.emoji,
  color: p.color,
  stage: p.stage,
  position: p.position,
  dueDate: p.dueDate,
  source: p.source,
  notionUrl: p.notionUrl,
  notionParent: p.notionParent,
  notionStatus: p.notionStatus,
  notionReason: p.notionReason,
  taskCount: p.tasks?.length ?? 0,
  doneCount: p.tasks?.filter((t) => t.status === "done").length ?? 0,
});

export const calendarColor = (c: Pick<Calendar, "color" | "customColor">) => c.customColor ?? c.color;

export const calendarDTO = (c: Calendar & { account: CalendarAccount }): CalendarDTO => ({
  id: c.id,
  name: c.name,
  color: calendarColor(c),
  accountEmail: c.account.email,
  visible: c.visible,
  canWrite: c.canWrite,
  primary: c.primary,
});

export const eventDTO = (e: Event & { calendar: Calendar }): EventDTO => ({
  id: e.id,
  calendarId: e.calendarId,
  title: e.title,
  start: e.start.toISOString(),
  end: e.end.toISOString(),
  allDay: e.allDay,
  // An event's own Google color wins over the calendar's; a local calendar override wins over both.
  color: e.calendar.customColor ?? e.color ?? e.calendar.color,
  location: e.location,
  description: e.description,
  htmlLink: e.htmlLink,
  meetLink: e.meetLink,
  declined: e.responseStatus === "declined",
});

/* --------------------------------------------------------------- loaders */

export const today = () => ymdInTz(new Date(), appTimeZone());

export async function listProjects(opts: { includeArchived?: boolean } = {}) {
  const rows = await prisma.project.findMany({
    where: opts.includeArchived ? {} : { archived: false },
    include: { tasks: { select: { status: true } } },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(projectDTO);
}

export async function listTasks(where: Prisma.TaskWhereInput = {}) {
  const rows = await prisma.task.findMany({ where, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  return rows.map(taskDTO);
}

export async function listCalendars() {
  const rows = await prisma.calendar.findMany({ include: { account: true }, orderBy: [{ account: { createdAt: "asc" } }, { primary: "desc" }, { name: "asc" }] });
  return rows.map(calendarDTO);
}

/** Events of visible calendars that touch [from, to) local days (inclusive from, exclusive to). */
export async function eventsBetween(from: string, to: string) {
  const tz = appTimeZone();
  const start = dayBounds(from, tz)[0];
  const end = dayBounds(addDays(to, -1), tz)[1];
  // All-day events are stored at UTC midnight, so widen by a day and let the client place them by date.
  const rows = await prisma.event.findMany({
    where: { calendar: { visible: true }, start: { lt: new Date(end.getTime() + 86400_000) }, end: { gt: new Date(start.getTime() - 86400_000) } },
    include: { calendar: true },
    orderBy: { start: "asc" },
  });
  return rows.map(eventDTO);
}

/** Tasks with a time block in the range (any status) plus every open task without one (the tray). */
export async function calendarTasks(from: string, to: string) {
  const tz = appTimeZone();
  const start = dayBounds(from, tz)[0];
  const end = dayBounds(addDays(to, -1), tz)[1];
  const rows = await prisma.task.findMany({
    where: { OR: [{ scheduledStart: { gte: new Date(start.getTime() - 86400_000), lt: end } }, { scheduledStart: null, status: { not: "done" } }] },
    orderBy: [{ position: "asc" }],
  });
  return rows.map(taskDTO);
}

export async function lastSyncs() {
  const [google, notion] = await Promise.all([
    prisma.syncRun.findFirst({ where: { kind: "google" }, orderBy: { startedAt: "desc" } }),
    prisma.syncRun.findFirst({ where: { kind: "notion" }, orderBy: { startedAt: "desc" } }),
  ]);
  return { google, notion };
}

export const notionContent = (p: Pick<Project, "notionContent">) => (Array.isArray(p.notionContent) ? (p.notionContent as unknown as SimpleBlock[]) : []);

/* ---------------------------------------------------------------- habits */

/** Today's checklist: active habits with done/streak/this-week. */
export async function habitsToday() {
  const day = today();
  // ~13 months of history covers any realistic current streak (the habit pages load everything).
  const since = addDays(day, -400);
  const [{ weekStart }, habits] = await Promise.all([
    getSettings(),
    prisma.habit.findMany({
      where: { archived: false },
      include: { checks: { where: { day: { gte: since } }, select: { day: true } } },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  return habits.map((h) => summarize(h, new Set(h.checks.map((c) => c.day)), day, weekStart));
}

/* ------------------------------------------------------- Bible in a year */

export async function bibleState() {
  const day = today();
  const [start, doneRows] = await Promise.all([getSetting(SETTING_KEYS.biblePlanStart), prisma.bibleDay.findMany({ select: { day: true } })]);
  const done = new Set(doneRows.map((r) => r.day));
  if (!start) return { started: false as const, done };
  const current = planDay(start, day);
  return { started: true as const, start, current, done, reading: current ? readingFor(current) : null, progress: progress(done, current), catchUp: nextUnread(done, current) };
}
