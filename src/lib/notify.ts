/**
 * Which reminders are due right now: events and task time blocks a few minutes before they start, and a morning
 * digest of the tasks due today. Pure (the caller passes "now" and the data); tested in notify.test.ts.
 * Each reminder has a stable `key` so it's sent once even though the check runs every few minutes.
 */
import { formatClockRange, minutesInTz } from "./dates";

export type NotifyPrefs = {
  /** Remind before calendar events. */
  events: boolean;
  /** Minutes before an event / time block. */
  lead: number;
  /** Remind at the start of tasks' time blocks on the calendar. */
  blocks: boolean;
  /** Morning digest of tasks due today (and overdue). */
  digest: boolean;
  /** Digest time, minutes after midnight. */
  digestAt: number;
};

export const DEFAULT_PREFS: NotifyPrefs = { events: true, lead: 10, blocks: true, digest: true, digestAt: 8 * 60 + 30 };

export function parsePrefs(raw: string | null | undefined): NotifyPrefs {
  try {
    const p = JSON.parse(raw ?? "{}");
    return {
      events: typeof p.events === "boolean" ? p.events : DEFAULT_PREFS.events,
      lead: [0, 5, 10, 15, 30, 60].includes(p.lead) ? p.lead : DEFAULT_PREFS.lead,
      blocks: typeof p.blocks === "boolean" ? p.blocks : DEFAULT_PREFS.blocks,
      digest: typeof p.digest === "boolean" ? p.digest : DEFAULT_PREFS.digest,
      digestAt: Number.isInteger(p.digestAt) && p.digestAt >= 0 && p.digestAt < 1440 ? p.digestAt : DEFAULT_PREFS.digestAt,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export type Reminder = { key: string; title: string; body: string; url: string };

type Ev = { id: string; title: string; start: Date; end: Date; allDay: boolean; calendar?: string | null; location?: string | null; declined?: boolean };
type Block = { id: string; title: string; start: Date; durationMin: number };

const until = (start: Date, now: Date) => (start.getTime() - now.getTime()) / 60000;
const when = (mins: number) => (mins <= 1 ? "Starting now" : `In ${Math.round(mins)} min`);

export function dueReminders(input: {
  now: Date;
  tz: string;
  today: string;
  prefs: NotifyPrefs;
  events: Ev[];
  blocks: Block[];
  dueToday: { title: string }[];
  overdue: number;
}): Reminder[] {
  const { now, tz, prefs } = input;
  const out: Reminder[] = [];
  // Late by at most a couple of minutes (the check runs every few minutes) — never for something long started.
  const inWindow = (start: Date) => {
    const m = until(start, now);
    return m <= prefs.lead && m > -3;
  };
  const range = (s: Date, e: Date) => formatClockRange(minutesInTz(s, tz), minutesInTz(e, tz) || 1440);

  if (prefs.events) {
    for (const e of input.events) {
      if (e.allDay || e.declined || !inWindow(e.start)) continue;
      const details = [range(e.start, e.end), e.calendar, e.location].filter(Boolean).join(" · ");
      out.push({ key: `event:${e.id}:${e.start.toISOString()}`, title: e.title, body: `${when(until(e.start, now))} · ${details}`, url: `/calendar?view=day&date=${input.today}` });
    }
  }
  if (prefs.blocks) {
    for (const b of input.blocks) {
      if (!inWindow(b.start)) continue;
      const end = new Date(b.start.getTime() + b.durationMin * 60000);
      out.push({ key: `block:${b.id}:${b.start.toISOString()}`, title: `Focus: ${b.title}`, body: `${when(until(b.start, now))} · ${range(b.start, end)}`, url: `/calendar?view=day&date=${input.today}` });
    }
  }
  if (prefs.digest) {
    const nowMin = minutesInTz(now, tz);
    // Within two hours after the chosen time, so a missed check still sends it — but not in the evening.
    if (nowMin >= prefs.digestAt && nowMin < prefs.digestAt + 120 && (input.dueToday.length || input.overdue)) {
      const n = input.dueToday.length;
      const titles = input.dueToday.slice(0, 4).map((t) => t.title);
      const more = n > 4 ? ` +${n - 4} more` : "";
      const overdue = input.overdue ? `${input.overdue} overdue` : "";
      out.push({
        key: `digest:${input.today}`,
        title: n ? `${n} task${n === 1 ? "" : "s"} due today` : `${input.overdue} overdue task${input.overdue === 1 ? "" : "s"}`,
        body: [titles.join(" · ") + more, n ? overdue : "Reschedule or finish them"].filter(Boolean).join("\n"),
        url: "/tasks",
      });
    }
  }
  return out;
}

