import { describe, expect, it } from "vitest";
import { clipToDay, layoutDay } from "./calendar-layout";

describe("layoutDay", () => {
  it("keeps non-overlapping blocks full width", () => {
    const r = layoutDay([
      { id: "a", start: 540, end: 600 },
      { id: "b", start: 600, end: 660 },
    ]);
    expect(r.map((x) => [x.id, x.col, x.cols])).toEqual([
      ["a", 0, 1],
      ["b", 0, 1],
    ]);
  });
  it("splits overlapping blocks and reuses free columns", () => {
    const r = layoutDay([
      { id: "a", start: 540, end: 660 },
      { id: "b", start: 570, end: 600 },
      { id: "c", start: 610, end: 640 },
      { id: "d", start: 700, end: 720 },
    ]);
    const by = Object.fromEntries(r.map((x) => [x.id, [x.col, x.cols]]));
    expect(by.a).toEqual([0, 2]);
    expect(by.b).toEqual([1, 2]);
    expect(by.c).toEqual([1, 2]);
    expect(by.d).toEqual([0, 1]);
  });
  it("gives zero-length blocks a minimum height", () => {
    const r = layoutDay([
      { id: "a", start: 540, end: 540 },
      { id: "b", start: 545, end: 600 },
    ]);
    expect(r.every((x) => x.cols === 2)).toBe(true);
  });
  it("clips ranges to the day", () => {
    expect(clipToDay(-60, 120)).toEqual({ start: 0, end: 120 });
    expect(clipToDay(1400, 1600)).toEqual({ start: 1400, end: 1440 });
    expect(clipToDay(-200, -100)).toBeNull();
  });
});
