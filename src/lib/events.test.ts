import { describe, expect, it } from "vitest";
import { buildEvent, dragRange, hm } from "./events";
import { zonedToUtc } from "./dates";

const tz = "America/New_York";

describe("new events", () => {
  it("builds a timed event in the app time zone", () => {
    const e = buildEvent({ title: " Lunch ", date: "2026-11-10", allDay: false, startMin: 12 * 60, endMin: 13 * 60 + 30, location: "Café" }, tz, zonedToUtc);
    expect(e.row.start.toISOString()).toBe("2026-11-10T17:00:00.000Z");
    expect(e.row.end.toISOString()).toBe("2026-11-10T18:30:00.000Z");
    expect(e.google).toMatchObject({ summary: "Lunch", location: "Café", start: { timeZone: tz } });
  });
  it("runs past midnight when the end is before the start", () => {
    const e = buildEvent({ title: "", date: "2026-11-10", allDay: false, startMin: 23 * 60, endMin: 60 }, tz, zonedToUtc);
    expect(e.row.title).toBe("New event");
    expect(e.row.end.toISOString()).toBe("2026-11-11T06:00:00.000Z");
  });
  it("builds all-day events with Google's exclusive end", () => {
    const e = buildEvent({ title: "Trip", date: "2026-11-27", endDate: "2026-11-29", allDay: true, startMin: 0, endMin: 0 }, tz, zonedToUtc);
    expect(e.google.start).toEqual({ date: "2026-11-27" });
    expect(e.google.end).toEqual({ date: "2026-11-30" });
    expect(e.row.end.toISOString()).toBe("2026-11-30T00:00:00.000Z");
  });
  it("turns a drag into a snapped range", () => {
    expect(dragRange(9 * 60 + 7, 10 * 60 + 52)).toEqual({ start: 9 * 60, end: 11 * 60 });
    expect(dragRange(10 * 60 + 52, 9 * 60 + 7)).toEqual({ start: 9 * 60, end: 11 * 60 });
    expect(dragRange(600, 603)).toEqual({ start: 600, end: 615 });
    expect(dragRange(1435, 1440)).toEqual({ start: 1425, end: 1440 });
    expect(hm(570)).toBe("09:30");
    expect(hm(1440)).toBe("23:59");
  });
});
