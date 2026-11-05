/**
 * Picks today's stoic thought and verse. The pick is fixed for the whole day (same on every device)
 * and walks the list with a stride that is coprime with its length, so consecutive days always differ
 * and every quote comes up once before any repeats.
 */
import { STOIC_QUOTES, VERSES, type StoicQuote, type Verse } from "./daily-content";

export type QuoteKind = "stoic" | "verse";
export const isQuoteKind = (k: unknown): k is QuoteKind => k === "stoic" || k === "verse";

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/** A stride near the golden ratio of n, coprime with n — feels shuffled, never repeats within a cycle. */
export function stride(n: number) {
  if (n <= 2) return 1;
  let s = Math.max(1, Math.round(n * 0.618));
  while (gcd(s, n) !== 1) s++;
  return s;
}

const dayNumber = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400_000);
};

/** Index into a list of length n for a day; `salt` keeps the two lists out of step. */
export function dailyIndex(ymd: string, n: number, salt = 0) {
  if (n <= 0) return 0;
  const k = ((dayNumber(ymd) + salt) % n + n) % n;
  return (k * stride(n)) % n;
}

export const stoicOfDay = (ymd: string): StoicQuote => STOIC_QUOTES[dailyIndex(ymd, STOIC_QUOTES.length, 0)];
export const verseOfDay = (ymd: string): Verse => VERSES[dailyIndex(ymd, VERSES.length, 17)];

/** "Another one": a random different index (the caller supplies the randomness, for tests). */
export function another(current: number, n: number, rand = Math.random()) {
  if (n <= 1) return 0;
  const step = 1 + Math.floor(rand * (n - 1));
  return (current + step) % n;
}

/** Quote by kind + id, for saving (the text is copied into SavedQuote). */
export function findQuote(kind: QuoteKind, key: string) {
  if (kind === "stoic") {
    const q = STOIC_QUOTES.find((x) => x.id === key);
    return q ? { text: q.text, source: q.author, detail: q.source, theme: null } : null;
  }
  const v = VERSES.find((x) => x.id === key);
  return v ? { text: v.text, source: v.ref, detail: "KJV", theme: v.theme } : null;
}
