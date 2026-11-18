import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, dueReminders, parsePrefs } from "./notify";

const tz = "America/New_York";
// 9:22 AM in New York on Nov 12, 2026 (EST, UTC-5)
const now = new Date("2026-11-12T14:22:00Z");
const at = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 12, h + 5, m));
const base = { now, tz, today: "2026-11-12", prefs: DEFAULT_PREFS, events: [], blocks: [], dueToday: [], overdue: 0 };

describe("reminders", () => {
  it("reminds before events (not all-day, declined, far away or long started)", () => {
    const r = dueReminders({
      ...base,
      events: [
        { id: "a", title: "Standup", start: at(9, 30), end: at(9, 45), allDay: false, calendar: "Work" },
        { id: "b", title: "Lunch", start: at(12), end: at(13), allDay: false },
        { id: "c", title: "Skip", start: at(9, 30), end: at(10), allDay: false, declined: true },
        { id: "d", title: "Holiday", start: at(0), end: at(0), allDay: true },
        { id: "e", title: "Old", start: at(9), end: at(10), allDay: false },
      ],
    });
    expect(r).toEqual([{ key: "event:a:2026-11-12T14:30:00.000Z", title: "Standup", body: "In 8 min · 9:30 – 9:45 AM · Work", url: "/calendar?view=day&date=2026-11-12" }]);
  });
  it("reminds at task time blocks", () => {
    const r = dueReminders({ ...base, blocks: [{ id: "t", title: "Write report", start: at(9, 22), durationMin: 45 }] });
    expect(r[0]).toMatchObject({ key: "block:t:2026-11-12T14:22:00.000Z", title: "Focus: Write report" });
    expect(r[0].body.startsWith("Starting now")).toBe(true);
  });
  it("sends the morning digest once it's time, not in the evening", () => {
    const dueToday = [{ title: "A" }, { title: "B" }, { title: "C" }, { title: "D" }, { title: "E" }];
    const r = dueReminders({ ...base, dueToday, overdue: 2 });
    expect(r).toEqual([{ key: "digest:2026-11-12", title: "5 tasks due today", body: "A · B · C · D +1 more\n2 overdue", url: "/tasks" }]);
    expect(dueReminders({ ...base, now: new Date("2026-11-12T23:00:00Z"), dueToday })).toEqual([]);
    expect(dueReminders({ ...base, now: new Date("2026-11-12T13:00:00Z"), dueToday })).toEqual([]);
    expect(dueReminders({ ...base, prefs: { ...DEFAULT_PREFS, digest: false }, dueToday })).toEqual([]);
  });
  it("reads saved preferences safely", () => {
    expect(parsePrefs('{"lead":15,"events":false}')).toMatchObject({ lead: 15, events: false, blocks: true });
    expect(parsePrefs('{"lead":7}').lead).toBe(10);
    expect(parsePrefs("not json")).toEqual(DEFAULT_PREFS);
  });
});
