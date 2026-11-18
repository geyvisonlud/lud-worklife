import { describe, expect, it } from "vitest";
import { dayWindow, hourTicks, mergeSpans, nowAndNext, openMinutes, untilLabel } from "./day-overview";

const h = (x: number) => x * 60;

describe("day overview", () => {
  it("shows 7 AM–10 PM, widened to the hour around early or late items", () => {
    expect(dayWindow([])).toEqual({ start: h(7), end: h(22) });
    expect(dayWindow([{ start: h(6) + 30, end: h(7) }, { start: h(22), end: h(22) + 40 }])).toEqual({ start: h(6), end: h(23) });
  });
  it("merges overlapping spans", () => {
    expect(mergeSpans([{ start: 60, end: 120 }, { start: 100, end: 180 }, { start: 200, end: 210 }, { start: 180, end: 190 }])).toEqual([
      { start: 60, end: 190 },
      { start: 200, end: 210 },
    ]);
  });
  it("counts open time left after now", () => {
    const w = { start: h(7), end: h(22) };
    // 4 PM now: 6 h left, minus a 7–9 PM event and a 4:30–5:30 focus block = 3 h
    expect(openMinutes(w, [{ start: h(19), end: h(21) }, { start: h(16) + 30, end: h(17) + 30 }, { start: h(9), end: h(10) }], h(16))).toBe(h(3));
    expect(openMinutes(w, [], h(23))).toBe(0);
    expect(openMinutes(w, [], h(5))).toBe(h(15));
  });
  it("finds what's on now and what's next", () => {
    const items = [
      { id: "a", start: h(9), end: h(10) },
      { id: "b", start: h(13), end: h(14) },
    ];
    expect(nowAndNext(items, h(9) + 30)).toMatchObject({ current: { id: "a" }, next: { id: "b" } });
    expect(nowAndNext(items, h(15))).toEqual({ current: null, next: null });
  });
  it("labels", () => {
    expect(untilLabel(5)).toBe("in 5 min");
    expect(untilLabel(80)).toBe("in 1 h 20");
    expect(untilLabel(180)).toBe("in 3 h");
    expect(hourTicks({ start: h(7), end: h(22) })).toEqual([h(9), h(12), h(15), h(18), h(21)]);
  });
});
