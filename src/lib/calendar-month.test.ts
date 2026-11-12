import { describe, expect, it } from "vitest";
import { addMonths, agenda, agendaLabel, busyDays, eventsOnDay, itemTime, matchesSearch, monthStartLabel, monthTitle, monthWeeks, shortDate, visibleRows, weekdayLetters } from "./calendar-month";
import { zonedToUtc } from "./dates";

const tz = "America/New_York";
const at = (day: string, h: number, m = 0) => zonedToUtc(day, h * 60 + m, tz).toISOString();
const ev = (id: string, start: string, end: string, allDay = false, title = id) => ({ id, title, start, end, allDay, color: "#f00" });

describe("month grid", () => {
  it("covers the month in whole weeks", () => {
    const w = monthWeeks("2026-11-12");
    expect(w[0][0]).toBe("2026-11-01"); // Nov 1 2026 is a Sunday
    expect(w.length).toBe(5);
    expect(w.at(-1)!.at(-1)).toBe("2026-12-05");
    expect(monthWeeks("2026-11-12", 1)[0][0]).toBe("2026-10-26");
    expect(monthWeeks("2026-02-03", 0, true).length).toBe(6);
  });
  it("moves by months and names them", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-01");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-01");
    expect(monthTitle("2026-11-12")).toBe("November 2026");
    expect(monthStartLabel("2026-12-01")).toBe("Dec 1");
    expect(weekdayLetters(1).join("")).toBe("MTWTFSS");
    expect(shortDate("2026-11-02")).toBe("11/2/2026");
  });
});

describe("events on a day", () => {
  const events = [
    ev("late", at("2026-11-12", 15), at("2026-11-12", 16)),
    ev("early", at("2026-11-12", 9), at("2026-11-12", 10)),
    ev("trip", "2026-11-11T00:00:00.000Z", "2026-11-14T00:00:00.000Z", true),
    ev("holiday", "2026-11-12T00:00:00.000Z", "2026-11-13T00:00:00.000Z", true),
    ev("night", at("2026-11-12", 22), at("2026-11-13", 2)),
    ev("other", at("2026-11-13", 9), at("2026-11-13", 10)),
  ];
  it("puts all-day first (longest first), then by time", () => {
    expect(eventsOnDay(events, "2026-11-12", tz).map((i) => i.event.id)).toEqual(["trip", "holiday", "early", "late", "night"]);
  });
  it("carries an overnight event to the next day", () => {
    const next = eventsOnDay(events, "2026-11-13", tz);
    expect(next.map((i) => i.event.id)).toEqual(["trip", "night", "other"]);
    expect(itemTime(next[1])).toBe("Until 2 AM");
    expect(itemTime(eventsOnDay(events, "2026-11-12", tz).find((i) => i.event.id === "night")!)).toBe("From 10 PM");
    expect(itemTime(eventsOnDay(events, "2026-11-12", tz)[2])).toBe("9 – 10 AM");
  });
  it("doesn't show an event ending at midnight on the next day", () => {
    const e = [ev("eve", at("2026-11-12", 20), at("2026-11-13", 0))];
    expect(eventsOnDay(e, "2026-11-13", tz)).toEqual([]);
  });
  it("counts busy days and builds the agenda", () => {
    const busy = busyDays(events, ["2026-11-10", "2026-11-12", "2026-11-15"], tz);
    expect([...busy]).toEqual([["2026-11-12", 5]]);
    const a = agenda(events, "2026-11-10", 5, tz, "2026-11-10");
    expect(a.map((d) => d.day)).toEqual(["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"]);
    expect(a[0].items).toEqual([]);
  });
});

describe("labels and rows", () => {
  it("labels agenda days", () => {
    expect(agendaLabel("2026-11-12", "2026-11-12")).toBe("Today");
    expect(agendaLabel("2026-11-13", "2026-11-12")).toBe("Tomorrow");
    expect(agendaLabel("2026-11-14", "2026-11-12")).toBe("Saturday");
  });
  it("keeps a row for 'more'", () => {
    expect(visibleRows(3, 4)).toEqual({ shown: 3, more: 0 });
    expect(visibleRows(6, 4)).toEqual({ shown: 3, more: 3 });
  });
  it("searches title and location", () => {
    expect(matchesSearch({ title: "Team standup", location: "Zoom" }, "standup zoom")).toBe(true);
    expect(matchesSearch({ title: "Team standup" }, "dentist")).toBe(false);
  });
});
