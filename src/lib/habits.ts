/**
 * Habits: streaks, completion rate and the heatmap grid (pure, tested in habits.test.ts).
 *
 * A habit has a goal of N days per week. Daily habits (N = 7) count streaks in days; habits with a
 * weekly goal (e.g. gym 3×/week) count streaks in weeks that met the goal. An unfinished today (or
 * an unfinished current week) never breaks a streak — it just doesn't add to it yet.
 */
import { addDays, daysBetween, startOfWeek } from "./dates";

export type Days = ReadonlySet<string>;

export const isDaily = (target: number) => target >= 7;

/** Days done in the week containing `day`. */
export function weekCount(days: Days, day: string, weekStart = 0) {
  const first = startOfWeek(day, weekStart);
  let n = 0;
  for (let i = 0; i < 7; i++) if (days.has(addDays(first, i))) n++;
  return n;
}

/** Current streak, in days (daily habit) or weeks (weekly goal). */
export function currentStreak(days: Days, today: string, target = 7, weekStart = 0) {
  if (isDaily(target)) {
    let d = days.has(today) ? today : addDays(today, -1);
    let n = 0;
    while (days.has(d)) {
      n++;
      d = addDays(d, -1);
    }
    return n;
  }
  let week = startOfWeek(today, weekStart);
  let n = 0;
  if (weekCount(days, week, weekStart) >= target) n++;
  week = addDays(week, -7);
  while (weekCount(days, week, weekStart) >= target) {
    n++;
    week = addDays(week, -7);
  }
  return n;
}

/** Longest streak ever, same unit as currentStreak. */
export function bestStreak(days: Days, target = 7, weekStart = 0) {
  if (!days.size) return 0;
  const sorted = [...days].sort();
  if (isDaily(target)) {
    let best = 1;
    let run = 1;
    for (let i = 1; i < sorted.length; i++) {
      run = daysBetween(sorted[i - 1], sorted[i]) === 1 ? run + 1 : 1;
      best = Math.max(best, run);
    }
    return best;
  }
  const weeks = new Map<string, number>();
  for (const d of sorted) {
    const w = startOfWeek(d, weekStart);
    weeks.set(w, (weeks.get(w) ?? 0) + 1);
  }
  const met = [...weeks.entries()].filter(([, c]) => c >= target).map(([w]) => w).sort();
  let best = met.length ? 1 : 0;
  let run = best;
  for (let i = 1; i < met.length; i++) {
    run = daysBetween(met[i - 1], met[i]) === 7 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

/**
 * Share of the goal met over the last `window` days (0–1), counted from the day the habit was
 * created so a new habit isn't punished for days before it existed.
 */
export function completionRate(days: Days, today: string, opts: { target?: number; window?: number; since?: string } = {}) {
  const target = Math.min(7, Math.max(1, opts.target ?? 7));
  const window = opts.window ?? 30;
  let from = addDays(today, -(window - 1));
  if (opts.since && opts.since > from) from = opts.since;
  const span = daysBetween(from, today) + 1;
  if (span <= 0) return 0;
  let done = 0;
  for (let i = 0; i < span; i++) if (days.has(addDays(from, i))) done++;
  return Math.min(1, done / ((span * target) / 7));
}

export type Cell = { day: string; done: boolean; future: boolean; beforeStart: boolean };

/** Heatmap columns (one per week, oldest first), each with 7 cells starting on `weekStart`. */
export function heatmap(days: Days, today: string, weeks: number, opts: { weekStart?: number; since?: string } = {}) {
  const ws = opts.weekStart ?? 0;
  const lastWeek = startOfWeek(today, ws);
  const cols: Cell[][] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const first = addDays(lastWeek, -7 * w);
    cols.push(
      Array.from({ length: 7 }, (_, i) => {
        const day = addDays(first, i);
        return { day, done: days.has(day), future: day > today, beforeStart: Boolean(opts.since && day < opts.since) };
      }),
    );
  }
  return cols;
}

/** Done count per week for the last `weeks` weeks (oldest first). */
export function weeklyTotals(days: Days, today: string, weeks: number, weekStart = 0) {
  const last = startOfWeek(today, weekStart);
  return Array.from({ length: weeks }, (_, i) => {
    const week = addDays(last, -7 * (weeks - 1 - i));
    return { week, count: weekCount(days, week, weekStart) };
  });
}

/** "12 days", "3 weeks" */
export const streakLabel = (n: number, target: number) => `${n} ${isDaily(target) ? (n === 1 ? "day" : "days") : n === 1 ? "week" : "weeks"}`;

export const goalLabel = (target: number) => (isDaily(target) ? "Every day" : `${target}× a week`);

export type HabitSummary = {
  id: string;
  name: string;
  emoji: string | null;
  color: string;
  targetPerWeek: number;
  doneToday: boolean;
  streak: number;
  thisWeek: number;
};

export function summarize(h: { id: string; name: string; emoji: string | null; color: string; targetPerWeek: number }, days: Days, today: string, weekStart = 0): HabitSummary {
  return {
    id: h.id,
    name: h.name,
    emoji: h.emoji,
    color: h.color,
    targetPerWeek: h.targetPerWeek,
    doneToday: days.has(today),
    streak: currentStreak(days, today, h.targetPerWeek, weekStart),
    thisWeek: weekCount(days, today, weekStart),
  };
}
