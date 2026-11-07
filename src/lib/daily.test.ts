import { describe, expect, it } from "vitest";
import { STOIC_QUOTES, VERSES } from "./daily-content";
import { another, dailyIndex, findQuote, stoicOfDay, stride, verseOfDay } from "./daily";
import { addDays } from "./dates";

describe("daily content", () => {
  it("has unique ids and no empty text", () => {
    for (const list of [STOIC_QUOTES, VERSES]) {
      const ids = list.map((x) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(list.every((x) => x.text.trim().length > 10)).toBe(true);
    }
  });
});

describe("pick of the day", () => {
  it("is stable within a day", () => {
    expect(stoicOfDay("2026-11-05")).toEqual(stoicOfDay("2026-11-05"));
    expect(verseOfDay("2026-11-05")).toEqual(verseOfDay("2026-11-05"));
  });
  it("shows every quote once before repeating, and never the same two days in a row", () => {
    for (const n of [STOIC_QUOTES.length, VERSES.length, 7, 10, 12]) {
      const seen = new Set<number>();
      let prev = -1;
      for (let i = 0; i < n; i++) {
        const idx = dailyIndex(addDays("2026-01-01", i), n);
        expect(idx).not.toBe(prev);
        seen.add(idx);
        prev = idx;
      }
      expect(seen.size).toBe(n);
    }
  });
  it("stride is coprime with the length", () => {
    const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
    for (const n of [3, 10, 38, 42, 100]) expect(gcd(stride(n), n)).toBe(1);
    expect(stride(1)).toBe(1);
  });
  it("another() never returns the current one", () => {
    for (const r of [0, 0.3, 0.5, 0.999]) expect(another(5, 38, r)).not.toBe(5);
    expect(another(0, 1, 0.5)).toBe(0);
  });
  it("finds quotes for saving", () => {
    expect(findQuote("stoic", "s4")).toMatchObject({ source: "Marcus Aurelius", detail: "Meditations 5.20" });
    expect(findQuote("verse", "v2")).toMatchObject({ source: "Isaiah 40:31", detail: "KJV", theme: "Strength" });
    expect(findQuote("verse", "nope")).toBeNull();
  });
});
