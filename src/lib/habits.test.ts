import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { bestStreak, completionRate, currentStreak, goalLabel, heatmap, streakLabel, summarize, weekCount, weeklyTotals } from "./habits";

const TODAY = "2026-11-05"; // Thursday; week (Sun start) = Nov 1–7
const set = (...d: string[]) => new Set(d);
const run = (end: string, n: number) => Array.from({ length: n }, (_, i) => addDays(end, -i));

describe("daily streaks", () => {
  it("counts back from today when done today", () => {
    expect(currentStreak(set(...run(TODAY, 5)), TODAY)).toBe(5);
  });
  it("an unfinished today doesn't break the streak", () => {
    expect(currentStreak(set(...run("2026-11-04", 3)), TODAY)).toBe(3);
  });
  it("a missed yesterday does", () => {
    expect(currentStreak(set("2026-11-03", "2026-11-02"), TODAY)).toBe(0);
    expect(currentStreak(set(), TODAY)).toBe(0);
  });
  it("best streak", () => {
    expect(bestStreak(set(...run("2026-10-10", 9), ...run(TODAY, 3)))).toBe(9);
    expect(bestStreak(set())).toBe(0);
    expect(bestStreak(set("2026-01-01"))).toBe(1);
  });
});

describe("weekly goals (3× a week)", () => {
  const days = set(
    // this week: 2 so far (in progress)
    "2026-11-02",
    "2026-11-04",
    // last week: 3 ✓
    "2026-10-26",
    "2026-10-28",
    "2026-10-30",
    // week before: 4 ✓
    "2026-10-19",
    "2026-10-20",
    "2026-10-21",
    "2026-10-23",
    // three weeks ago: 1 ✗
    "2026-10-13",
  );
  it("counts weeks that met the goal; an unfinished current week doesn't break it", () => {
    expect(weekCount(days, TODAY)).toBe(2);
    expect(currentStreak(days, TODAY, 3)).toBe(2);
    expect(currentStreak(new Set([...days, "2026-11-05"]), TODAY, 3)).toBe(3);
  });
  it("best streak in weeks", () => {
    expect(bestStreak(days, 3)).toBe(2);
  });
  it("respects Monday-start weeks", () => {
    expect(weekCount(set("2026-11-01", "2026-11-02"), TODAY, 1)).toBe(1); // Sun Nov 1 belongs to the previous Mon-week
  });
});

describe("completion rate", () => {
  it("daily: share of days done in the window", () => {
    expect(completionRate(set(...run(TODAY, 15)), TODAY, { window: 30 })).toBeCloseTo(0.5);
  });
  it("weekly goal: 3 a week is 100%", () => {
    const days = set("2026-10-30", "2026-11-02", "2026-11-04");
    expect(completionRate(days, TODAY, { target: 3, window: 7 })).toBe(1);
  });
  it("doesn't count days before the habit existed", () => {
    expect(completionRate(set("2026-11-04", TODAY), TODAY, { since: "2026-11-04" })).toBe(1);
  });
});

describe("heatmap and totals", () => {
  it("builds week columns ending this week", () => {
    const cols = heatmap(set(TODAY, "2026-10-01"), TODAY, 10, { since: "2026-10-01" });
    expect(cols).toHaveLength(10);
    expect(cols[9][0].day).toBe("2026-11-01");
    expect(cols[9][4]).toMatchObject({ day: TODAY, done: true, future: false });
    expect(cols[9][5].future).toBe(true);
    expect(cols[0][0].beforeStart).toBe(true);
  });
  it("weekly totals", () => {
    const t = weeklyTotals(set(TODAY, "2026-11-02", "2026-10-27"), TODAY, 3);
    expect(t.map((x) => x.count)).toEqual([0, 1, 2]);
  });
  it("labels and summary", () => {
    expect(streakLabel(1, 7)).toBe("1 day");
    expect(streakLabel(4, 3)).toBe("4 weeks");
    expect(goalLabel(7)).toBe("Every day");
    expect(goalLabel(3)).toBe("3× a week");
    const s = summarize({ id: "h", name: "Read", emoji: "📖", color: "blue", targetPerWeek: 7 }, set(...run(TODAY, 4)), TODAY);
    expect(s).toMatchObject({ doneToday: true, streak: 4, thisWeek: 4 });
  });
});
