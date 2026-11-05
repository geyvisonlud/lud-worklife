import { describe, expect, it } from "vitest";
import { bucketOf, daySummary, groupTasks, parseQuickAdd } from "./tasks";

const NY = "America/New_York";
const TODAY = "2026-11-05";
const t = (o: Partial<Parameters<typeof bucketOf>[0]> = {}) => ({ id: Math.random().toString(), status: "todo", dueDate: null, scheduledStart: null, durationMin: 30, priority: 0, position: 0, ...o });

describe("task buckets", () => {
  it("buckets by schedule, then due date", () => {
    expect(bucketOf(t(), TODAY, NY)).toBe("inbox");
    expect(bucketOf(t({ status: "done", dueDate: "2026-11-01" }), TODAY, NY)).toBe("done");
    expect(bucketOf(t({ dueDate: "2026-11-04" }), TODAY, NY)).toBe("overdue");
    expect(bucketOf(t({ dueDate: TODAY }), TODAY, NY)).toBe("today");
    expect(bucketOf(t({ dueDate: "2026-11-09" }), TODAY, NY)).toBe("upcoming");
    // 9 pm New York on the 5th is already the 6th in UTC — still today.
    expect(bucketOf(t({ scheduledStart: new Date("2026-11-06T02:00:00Z") }), TODAY, NY)).toBe("today");
    expect(bucketOf(t({ scheduledStart: new Date("2026-11-04T15:00:00Z") }), TODAY, NY)).toBe("overdue");
    // Scheduled for later but already past due → overdue.
    expect(bucketOf(t({ dueDate: "2026-11-03", scheduledStart: new Date("2026-11-07T15:00:00Z") }), TODAY, NY)).toBe("overdue");
  });
  it("sorts scheduled first, then due date, then priority", () => {
    const g = groupTasks(
      [t({ id: "a", dueDate: TODAY, priority: 1 }), t({ id: "b", dueDate: TODAY, priority: 3 }), t({ id: "c", scheduledStart: new Date("2026-11-05T14:00:00Z") })],
      TODAY,
      NY,
    );
    expect(g.today.map((x) => x.id)).toEqual(["c", "b", "a"]);
  });
  it("summarizes the day", () => {
    const s = daySummary(
      [t({ dueDate: TODAY }), t({ scheduledStart: new Date("2026-11-05T15:00:00Z"), durationMin: 90 }), t({ dueDate: "2026-11-01" })],
      [{ start: new Date("2026-11-05T14:00:00Z"), end: new Date("2026-11-05T15:00:00Z"), allDay: false }, { start: new Date(), end: new Date(), allDay: true }],
      TODAY,
      NY,
    );
    expect(s).toMatchObject({ dueToday: 2, overdue: 1, events: 1, meetingMin: 60, focusMin: 90 });
  });
});

describe("quick add", () => {
  it("parses dates, priority and duration", () => {
    expect(parseQuickAdd("Write report tomorrow !high 45m", TODAY)).toEqual({ title: "Write report", dueDate: "2026-11-06", priority: 3, durationMin: 45 });
    expect(parseQuickAdd("Call bank today 1.5h", TODAY)).toEqual({ title: "Call bank", dueDate: TODAY, priority: 0, durationMin: 90 });
    expect(parseQuickAdd("Plan 2026-12-01 !low", TODAY)).toEqual({ title: "Plan", dueDate: "2026-12-01", priority: 1, durationMin: null });
    expect(parseQuickAdd("Just a task", TODAY).title).toBe("Just a task");
  });
});
