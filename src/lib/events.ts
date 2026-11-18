/**
 * Events created here (the calendar's drag-to-create, notes → event): from a day, start/end minutes
 * (or all day) to the stored instants and the Google Calendar API body. Pure; tested in events.test.ts.
 */
import { addDays } from "./dates";

export type NewEventInput = {
  title: string;
  date: string; // YYYY-MM-DD (start day)
  allDay: boolean;
  /** Minutes after midnight (timed events). An end at or before the start runs into the next day. */
  startMin: number;
  endMin: number;
  /** All-day: last day (inclusive); defaults to `date`. */
  endDate?: string;
  location?: string | null;
  description?: string | null;
};

export function buildEvent(input: NewEventInput, tz: string, toUtc: (ymd: string, minutes: number, tz: string) => Date) {
  const title = input.title.trim().slice(0, 300) || "New event";
  const location = input.location?.trim() || undefined;
  const description = input.description?.trim().slice(0, 8000) || undefined;
  if (input.allDay) {
    const last = input.endDate && input.endDate >= input.date ? input.endDate : input.date;
    const after = addDays(last, 1); // Google's all-day end is exclusive
    return {
      row: { title, location: location ?? null, description: description ?? null, allDay: true, start: new Date(`${input.date}T00:00:00.000Z`), end: new Date(`${after}T00:00:00.000Z`) },
      google: { summary: title, location, description, start: { date: input.date }, end: { date: after } },
    };
  }
  const s = clamp(input.startMin);
  const e = clamp(input.endMin);
  const endDay = e <= s ? addDays(input.date, 1) : input.date;
  const start = toUtc(input.date, s, tz);
  const end = toUtc(endDay, e, tz);
  return {
    row: { title, location: location ?? null, description: description ?? null, allDay: false, start, end },
    google: { summary: title, location, description, start: { dateTime: start.toISOString(), timeZone: tz }, end: { dateTime: end.toISOString(), timeZone: tz } },
  };
}

const clamp = (m: number) => Math.max(0, Math.min(1440, Math.round(m)));

/** A drag on the grid (from → to, either direction) as a start/end, snapped; at least `min` long. */
export function dragRange(fromMin: number, toMin: number, step = 15, min = 15) {
  let a = Math.floor(Math.min(fromMin, toMin) / step) * step;
  let b = Math.min(1440, Math.ceil(Math.max(fromMin, toMin) / step) * step);
  a = Math.max(0, Math.min(1440 - min, a));
  if (b - a < min) b = a + min;
  return { start: a, end: Math.min(1440, b) };
}

/** "HH:MM" for an <input type="time"> (1440 → "24:00" is not valid there, so "23:59"). */
export const hm = (m: number) => {
  const v = Math.max(0, Math.min(1439, m === 1440 ? 1439 : m));
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
};
