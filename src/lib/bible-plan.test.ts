import { describe, expect, it } from "vitest";
import { BOOKS } from "./bible-books";
import { PLAN_DAYS, TRACKS, dateOfDay, interleave, nextUnread, passageLabel, planDay, progress, readingFor, sliceForDay, toPassages } from "./bible-plan";

describe("books", () => {
  it("has the 66 books with the right chapter counts", () => {
    expect(BOOKS).toHaveLength(66);
    const sum = (t: string) => BOOKS.filter((b) => b.testament === t).reduce((s, b) => s + b.chapters, 0);
    expect(sum("OT")).toBe(929);
    expect(sum("NT")).toBe(260);
    expect(new Set(BOOKS.map((b) => b.name)).size).toBe(66);
  });
});

describe("plan", () => {
  it("covers every chapter exactly once over 365 days", () => {
    const seen = new Map<string, number>();
    for (let d = 1; d <= PLAN_DAYS; d++) for (const c of readingFor(d).chapters) seen.set(`${c.book} ${c.chapter}`, (seen.get(`${c.book} ${c.chapter}`) ?? 0) + 1);
    expect(seen.size).toBe(1189);
    expect([...seen.values()].every((n) => n === 1)).toBe(true);
  });
  it("reads in order and spreads evenly (2–4 chapters a day)", () => {
    expect(readingFor(1).ot[0]).toEqual({ book: "Genesis", from: 1, to: 2 });
    expect(readingFor(1).nt.map(passageLabel)).toEqual(["Matthew 1"]);
    expect(readingFor(PLAN_DAYS).ot.at(-1)).toMatchObject({ book: "Malachi", to: 4 });
    const counts = Array.from({ length: PLAN_DAYS }, (_, i) => readingFor(i + 1).chapters.length);
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(2);
    expect(Math.max(...counts)).toBeLessThanOrEqual(5);
  });
  it("weaves the Psalms through the New Testament", () => {
    const nt = TRACKS.nt.chapters;
    expect(nt).toHaveLength(410);
    const firstPsalm = nt.findIndex((c) => c.book === "Psalms");
    const lastMatthew = nt.findLastIndex((c) => c.book === "Matthew");
    expect(firstPsalm).toBeLessThan(lastMatthew);
    expect(nt.filter((c) => c.book === "Psalms").map((c) => c.chapter)).toEqual(Array.from({ length: 150 }, (_, i) => i + 1));
  });
  it("interleave keeps order and spreads evenly", () => {
    expect(interleave<number | string>([1, 2, 3, 4], ["a", "b"])).toEqual([1, 2, "a", 3, 4, "b"]);
    expect(interleave([], ["a"])).toEqual(["a"]);
  });
  it("slices and merges", () => {
    expect(sliceForDay([1, 2, 3, 4, 5, 6], 0, 3)).toEqual([1, 2]);
    expect(toPassages([{ book: "Ruth", chapter: 4 }, { book: "1 Samuel", chapter: 1 }, { book: "1 Samuel", chapter: 2 }])).toEqual([
      { book: "Ruth", from: 4, to: 4 },
      { book: "1 Samuel", from: 1, to: 2 },
    ]);
  });
  it("labels", () => {
    expect(passageLabel({ book: "Genesis", from: 1, to: 3 })).toBe("Genesis 1–3");
    expect(passageLabel({ book: "Psalms", from: 23, to: 23 })).toBe("Psalm 23");
    expect(passageLabel({ book: "Psalms", from: 1, to: 2 })).toBe("Psalms 1–2");
    expect(passageLabel({ book: "Jude", from: 1, to: 1 })).toBe("Jude");
  });
});

describe("calendar", () => {
  it("maps dates to plan days and wraps after a year", () => {
    expect(planDay("2026-11-06", "2026-11-05")).toBe(0);
    expect(planDay("2026-11-06", "2026-11-06")).toBe(1);
    expect(planDay("2026-01-01", "2026-12-31")).toBe(365);
    expect(planDay("2026-01-01", "2027-01-01")).toBe(1);
    expect(dateOfDay("2026-11-06", 3)).toBe("2026-11-08");
  });
  it("progress and catching up", () => {
    const done = new Set([1, 2, 4]);
    expect(progress(done, 5)).toMatchObject({ read: 3, behind: 1 });
    expect(nextUnread(done, 5)).toBe(3);
    expect(nextUnread(new Set([1, 2]), 2)).toBeNull();
  });
});
