/**
 * The shape of today, for the overview ribbon on Today: which hours to show, how much time is
 * still open, and what comes next. Minutes are wall-clock minutes after local midnight (0–1440).
 * Pure; tested in day-overview.test.ts.
 */

export type Span = { start: number; end: number };

/** Hours shown on the ribbon: 7 AM–10 PM, widened to the hour around anything earlier or later. */
export function dayWindow(items: Span[], from = 7 * 60, to = 22 * 60): Span {
  let start = from;
  let end = to;
  for (const i of items) {
    if (i.start < start) start = Math.max(0, Math.floor(i.start / 60) * 60);
    if (i.end > end) end = Math.min(1440, Math.ceil(i.end / 60) * 60);
  }
  return { start, end };
}

/** Overlapping or touching spans merged, sorted by start. */
export function mergeSpans(spans: Span[]): Span[] {
  const sorted = spans.filter((s) => s.end > s.start).sort((a, b) => a.start - b.start);
  const out: Span[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else out.push({ ...s });
  }
  return out;
}

/** Unscheduled minutes left in the window after `now` (nothing on the calendar, no focus block). */
export function openMinutes(window: Span, busy: Span[], now: number) {
  const from = Math.max(window.start, now);
  if (from >= window.end) return 0;
  let free = window.end - from;
  for (const b of mergeSpans(busy)) {
    const s = Math.max(b.start, from);
    const e = Math.min(b.end, window.end);
    if (e > s) free -= e - s;
  }
  return Math.max(0, free);
}

/** The item happening now, else the next one to start (null when the day is done). */
export function nowAndNext<T extends Span>(items: T[], now: number): { current: T | null; next: T | null } {
  const sorted = [...items].sort((a, b) => a.start - b.start);
  const current = sorted.find((i) => i.start <= now && i.end > now) ?? null;
  const next = sorted.find((i) => i.start > now) ?? null;
  return { current, next };
}

/** "in 5 min", "in 1 h 20", "in 3 h" */
export function untilLabel(minutes: number) {
  if (minutes < 60) return `in ${Math.max(1, Math.round(minutes))} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m ? `in ${h} h ${String(m).padStart(2, "0")}` : `in ${h} h`;
}

/** Hour marks to label on the ribbon: every `step` hours inside the window. */
export function hourTicks(window: Span, step = 3) {
  const ticks: number[] = [];
  for (let m = Math.ceil(window.start / 60) * 60; m <= window.end; m += 60) if ((m / 60) % step === 0) ticks.push(m);
  return ticks;
}
