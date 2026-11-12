import { describe, expect, it } from "vitest";
import { wallMinutes, addDays, dayBounds, formatClockRange, formatDuration, formatRange, minutesInTz, snapMinutes, startOfWeek, ymdInTz, zonedToUtc } from "./dates";

const NY = "America/New_York";

describe("dates", () => {
  it("converts wall-clock time to UTC across DST", () => {
    expect(zonedToUtc("2026-07-01", 9 * 60, NY).toISOString()).toBe("2026-07-01T13:00:00.000Z");
    expect(zonedToUtc("2026-12-01", 9 * 60, NY).toISOString()).toBe("2026-12-01T14:00:00.000Z");
    // DST ends Nov 1 2026 in the US: midnight is still EDT, 9 am is EST.
    expect(zonedToUtc("2026-11-01", 0, NY).toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(zonedToUtc("2026-11-01", 9 * 60, NY).toISOString()).toBe("2026-11-01T14:00:00.000Z");
  });
  it("reads local day and minutes", () => {
    const d = new Date("2026-11-06T03:30:00Z"); // 10:30 pm on the 5th in New York
    expect(ymdInTz(d, NY)).toBe("2026-11-05");
    expect(minutesInTz(d, NY)).toBe(22 * 60 + 30);
    expect(ymdInTz(d, "America/Sao_Paulo")).toBe("2026-11-06");
  });
  it("day bounds are 25 hours on the DST day", () => {
    const [a, b] = dayBounds("2026-11-01", NY);
    expect((b.getTime() - a.getTime()) / 3600000).toBe(25);
  });
  it("weeks and day math", () => {
    expect(startOfWeek("2026-11-05")).toBe("2026-11-01");
    expect(startOfWeek("2026-11-05", 1)).toBe("2026-11-02");
    expect(startOfWeek("2026-11-01", 1)).toBe("2026-10-26");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("places times by wall clock, even on DST days", () => {
    expect(wallMinutes(zonedToUtc("2026-11-01", 600, NY), "2026-11-01", NY)).toBe(600);
    expect(wallMinutes(zonedToUtc("2026-10-31", 23 * 60, NY), "2026-11-01", NY)).toBe(-60);
    expect(wallMinutes(zonedToUtc("2026-11-02", 60, NY), "2026-11-01", NY)).toBe(1500);
  });
  it("snaps to 15 minutes within the day", () => {
    expect(snapMinutes(52)).toBe(45);
    expect(snapMinutes(53)).toBe(60);
    expect(snapMinutes(-20)).toBe(0);
    expect(snapMinutes(1439)).toBe(1425);
  });
  it("formats", () => {
    expect(formatClockRange(9 * 60 + 30, 10 * 60 + 15)).toBe("9:30 – 10:15 AM");
    expect(formatClockRange(11 * 60, 13 * 60)).toBe("11 AM – 1 PM");
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(90)).toBe("1 h 30");
    expect(formatRange("2026-11-01", "2026-11-07")).toBe("Nov 1 – 7, 2026");
    expect(formatRange("2026-10-26", "2026-11-01")).toBe("Oct 26 – Nov 1, 2026");
  });
});
