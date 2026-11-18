/**
 * Bible in a year: all 1,189 chapters over 365 days, in two readings a day —
 *  • Old Testament (Genesis → Malachi, without Psalms), ~2–3 chapters a day
 *  • New Testament with the Psalms woven in, ~1 chapter a day
 * Chapters are spread evenly (no day gets a pile-up), consecutive chapters of a book are merged
 * into one passage ("Genesis 1–3"). Pure and tested in bible-plan.test.ts.
 */
import { BOOKS } from "./bible-books";
import { addDays, daysBetween } from "./dates";

export const PLAN_DAYS = 365;

export type Chapter = { book: string; chapter: number };
export type Passage = { book: string; from: number; to: number };

const chaptersOf = (names: string[]) => names.flatMap((n) => Array.from({ length: BOOKS.find((b) => b.name === n)!.chapters }, (_, i) => ({ book: n, chapter: i + 1 })));

const OT = chaptersOf(BOOKS.filter((b) => b.testament === "OT" && b.name !== "Psalms").map((b) => b.name));
const NT = chaptersOf(BOOKS.filter((b) => b.testament === "NT").map((b) => b.name));
const PSALMS = chaptersOf(["Psalms"]);

/** Merges two lists keeping each one's order, spreading the shorter one evenly through the longer. */
export function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    // Take from whichever list is further behind its own pace.
    if (j >= b.length || (i < a.length && (i + 1) / a.length <= (j + 1) / b.length)) out.push(a[i++]);
    else out.push(b[j++]);
  }
  return out;
}

export const TRACKS = {
  ot: { label: "Old Testament", chapters: OT },
  nt: { label: "New Testament & Psalms", chapters: interleave(NT, PSALMS) },
} as const;

/** Even split of n items over `days`: the slice for day d (0-based). */
export function sliceForDay<T>(items: T[], d: number, days = PLAN_DAYS) {
  const from = Math.floor((d * items.length) / days);
  const to = Math.floor(((d + 1) * items.length) / days);
  return items.slice(from, to);
}

/** Consecutive chapters of the same book become one passage. */
export function toPassages(chapters: Chapter[]): Passage[] {
  const out: Passage[] = [];
  for (const c of chapters) {
    const last = out[out.length - 1];
    if (last && last.book === c.book && last.to + 1 === c.chapter) last.to = c.chapter;
    else out.push({ book: c.book, from: c.chapter, to: c.chapter });
  }
  return out;
}

export type DayReading = { day: number; ot: Passage[]; nt: Passage[]; chapters: Chapter[] };

/** Readings for plan day 1…365. */
export function readingFor(day: number): DayReading {
  const d = Math.min(PLAN_DAYS, Math.max(1, Math.round(day))) - 1;
  const ot = sliceForDay(TRACKS.ot.chapters, d);
  const nt = sliceForDay(TRACKS.nt.chapters, d);
  return { day: d + 1, ot: toPassages(ot), nt: toPassages(nt), chapters: [...ot, ...nt] };
}

/** "Genesis 1–3", "Psalm 23", "Obadiah" (single-chapter books have no number). */
export function passageLabel(p: Passage) {
  const one = BOOKS.find((b) => b.name === p.book)?.chapters === 1;
  const name = p.book === "Psalms" && p.from === p.to ? "Psalm" : p.book;
  if (one) return name;
  return p.from === p.to ? `${name} ${p.from}` : `${name} ${p.from}–${p.to}`;
}

/** Plan day for a calendar day (1 on the start date). After day 365 the plan starts over. */
export function planDay(start: string, today: string) {
  const elapsed = daysBetween(start, today);
  if (elapsed < 0) return 0; // not started yet
  return (elapsed % PLAN_DAYS) + 1;
}

/** Calendar date of a plan day. */
export const dateOfDay = (start: string, day: number) => addDays(start, day - 1);

/** Progress so far: how many days are read and how many past days were missed. */
export function progress(done: ReadonlySet<number>, current: number) {
  let behind = 0;
  for (let d = 1; d < current; d++) if (!done.has(d)) behind++;
  const read = [...done].filter((d) => d >= 1 && d <= PLAN_DAYS).length;
  const chapters = [...done].reduce((s, d) => s + readingFor(d).chapters.length, 0);
  return { read, behind, pct: read / PLAN_DAYS, chapters };
}

/** First unread day up to today (where to catch up), or null when up to date. */
export function nextUnread(done: ReadonlySet<number>, current: number) {
  for (let d = 1; d <= current; d++) if (!done.has(d)) return d;
  return null;
}
