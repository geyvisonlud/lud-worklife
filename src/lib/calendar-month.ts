/**
 * Month grid, mini calendar and agenda (Fantastical-style calendar): which days to draw and what goes on each one.
 * Pure — days are YYYY-MM-DD in the app time zone, instants are ISO strings.
 */
import { addDays, daysBetween, formatClock, formatClockRange, monthName, startOfWeek, wallMinutes, weekday } from "./dates";

export const firstOfMonth = (ymd: string) => `${ymd.slice(0, 7)}-01`;

/** First day of the month `n` months away. */
export function addMonths(ymd: string, n: number) {
  const [y, m] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** "November 2026" */
export const monthTitle = (ymd: string) => {
  const [y, m] = ymd.split("-").map(Number);
  return `${new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)))} ${y}`;
};

/** Weeks (rows of 7 days) that cover the month of `ymd`; `six` always returns 6 rows (mini calendars keep their height). */
export function monthWeeks(ymd: string, weekStartsOn = 0, six = false) {
  const first = firstOfMonth(ymd);
  const next = addMonths(ymd, 1);
  const start = startOfWeek(first, weekStartsOn);
  const rows = six ? 6 : Math.ceil(daysBetween(start, next) / 7);
  return Array.from({ length: rows }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
}

/** Weekday initials in display order ("S M T W T F S"). */
export const weekdayLetters = (weekStartsOn = 0, long = false) =>
  Array.from({ length: 7 }, (_, i) => (long ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] : ["S", "M", "T", "W", "T", "F", "S"])[(i + weekStartsOn) % 7]);

export type DayEvent = { id: string; title: string; start: string; end: string; allDay: boolean; color: string; declined?: boolean };

/** Does the event touch `day`? All-day events are stored at UTC midnight with an exclusive end date. */
export function onDay(e: DayEvent, day: string, tz: string) {
  if (e.allDay) {
    const s = e.start.slice(0, 10);
    const en = e.end.slice(0, 10);
    return s <= day && (day < en || s === en);
  }
  const s = wallMinutes(new Date(e.start), day, tz);
  const en = wallMinutes(new Date(e.end), day, tz);
  return s < 1440 && (en > 0 || (s === 0 && en === 0));
}

export type DayItem<E extends DayEvent> = {
  event: E;
  /** Minutes from this day's midnight (clipped); all-day = 0. */
  start: number;
  end: number;
  /** Started on an earlier day (a continuing event). */
  continued: boolean;
};

/** The day's events: all-day first (longest first), then by start time, then by title. */
export function eventsOnDay<E extends DayEvent>(events: E[], day: string, tz: string): DayItem<E>[] {
  return events
    .filter((e) => onDay(e, day, tz))
    .map((e) => {
      if (e.allDay) return { event: e, start: 0, end: 1440, continued: e.start.slice(0, 10) < day };
      const s = wallMinutes(new Date(e.start), day, tz);
      const en = wallMinutes(new Date(e.end), day, tz);
      return { event: e, start: Math.max(0, s), end: Math.min(1440, en), continued: s < 0 };
    })
    .sort((a, b) => {
      if (a.event.allDay !== b.event.allDay) return a.event.allDay ? -1 : 1;
      if (a.event.allDay) return allDayLength(b.event) - allDayLength(a.event) || a.event.title.localeCompare(b.event.title);
      return a.start - b.start || a.end - b.end || a.event.title.localeCompare(b.event.title);
    });
}

const allDayLength = (e: DayEvent) => Math.max(1, daysBetween(e.start.slice(0, 10), e.end.slice(0, 10)));

/** Map of day → number of events, for the dots in mini calendars. */
export function busyDays(events: DayEvent[], days: string[], tz: string) {
  const out = new Map<string, number>();
  for (const day of days) {
    const n = events.filter((e) => !e.declined && onDay(e, day, tz)).length;
    if (n) out.set(day, n);
  }
  return out;
}

/** How many rows fit in a month cell, keeping one for "N more…" when the day has more. */
export function visibleRows(total: number, capacity: number) {
  if (total <= capacity) return { shown: total, more: 0 };
  const shown = Math.max(0, capacity - 1);
  return { shown, more: total - shown };
}

/** "TODAY", "TOMORROW", "YESTERDAY" or the weekday ("SATURDAY"). */
export function agendaLabel(day: string, today: string) {
  const diff = daysBetween(today, day);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][weekday(day)];
}

/** "11/12/2026" (the small date next to an agenda heading). */
export const shortDate = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return `${m}/${d}/${y}`;
};

/** "Nov 1" — the badge on the first day of a month in the grid. */
export const monthStartLabel = (day: string) => `${monthName(Number(day.slice(5, 7)))} 1`;

/** Agenda: `n` days from `from`, each with its events; days with nothing are left out unless they're `keep` (today). */
export function agenda<E extends DayEvent>(events: E[], from: string, n: number, tz: string, keep?: string) {
  const out: { day: string; items: DayItem<E>[] }[] = [];
  for (let i = 0; i < n; i++) {
    const day = addDays(from, i);
    const items = eventsOnDay(events, day, tz);
    if (items.length || day === keep) out.push({ day, items });
  }
  return out;
}

/** "All day", "9 – 10 AM", "Until 11 AM" (continuing), "From 10 PM" (runs past midnight). */
export function itemTime(it: { start: number; end: number; continued: boolean; event: { allDay: boolean } }) {
  if (it.event.allDay) return "All day";
  if (it.continued && it.end >= 1440) return "All day";
  if (it.continued) return `Until ${formatClock(it.end)}`;
  if (it.end >= 1440) return `From ${formatClock(it.start)}`;
  return formatClockRange(it.start, it.end);
}

/** Matches a search ("dentist", "zoom standup") against an event's title and location: every word must appear. */
export function matchesSearch(e: { title: string; location?: string | null }, q: string) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = `${e.title} ${e.location ?? ""}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}
