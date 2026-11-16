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
  it("sorts time blocks first, then the manual order; upcoming by day", () => {
    const g = groupTasks(
      [
        t({ id: "a", dueDate: TODAY, priority: 3, position: 2 }),
        t({ id: "b", dueDate: TODAY, priority: 1, position: 1 }),
        t({ id: "c", scheduledStart: new Date("2026-11-05T14:00:00Z") }),
        t({ id: "u2", dueDate: "2026-11-09", position: 1 }),
        t({ id: "u1", dueDate: "2026-11-07", position: 5 }),
      ],
      TODAY,
      NY,
    );
    expect(g.today.map((x) => x.id)).toEqual(["c", "b", "a"]);
    expect(g.upcoming.map((x) => x.id)).toEqual(["u1", "u2"]);
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

import { boardStats, EMPTY_FILTER, filterBoardTasks, flagDate } from "./tasks";

describe("board toolbar", () => {
  const t = (title: string, o: Partial<{ priority: number; projectId: string | null; dueDate: string | null; status: string; position: number; notes: string }> = {}) => ({
    title,
    notes: o.notes ?? null,
    priority: o.priority ?? 0,
    projectId: o.projectId ?? null,
    dueDate: o.dueDate ?? null,
    status: o.status ?? "todo",
    position: o.position ?? 0,
  });
  const tasks = [
    t("Write brief", { priority: 3, projectId: "p1", dueDate: "2026-11-04", position: 3 }),
    t("Call bank", { priority: 1, dueDate: "2026-11-05", position: 1 }),
    t("Plan trip", { priority: 2, projectId: "p2", dueDate: "2026-11-09", position: 2, notes: "flights" }),
    t("Someday", { position: 4 }),
    t("Old", { status: "done", dueDate: "2026-11-01", position: 5 }),
  ];
  const names = (id: string) => (id === "p1" ? "Website" : "Travel");
  const ids = (f: Partial<typeof EMPTY_FILTER>) => filterBoardTasks(tasks, { ...EMPTY_FILTER, ...f }, TODAY, names).map((x) => x.title);

  it("searches title, notes and project", () => {
    expect(ids({ q: "flights" })).toEqual(["Plan trip"]);
    expect(ids({ q: "website" })).toEqual(["Write brief"]);
  });
  it("filters by priority, project and due", () => {
    expect(ids({ priority: "3" })).toEqual(["Write brief"]);
    expect(ids({ project: "none" })).toEqual(["Call bank", "Someday", "Old"]);
    expect(ids({ due: "overdue" })).toEqual(["Write brief"]);
    expect(ids({ due: "today" })).toEqual(["Call bank"]);
    expect(ids({ due: "week" })).toEqual(["Write brief", "Call bank", "Plan trip"]);
    expect(ids({ due: "none" })).toEqual(["Someday"]);
  });
  it("sorts", () => {
    expect(ids({ sort: "due" })).toEqual(["Old", "Write brief", "Call bank", "Plan trip", "Someday"]);
    expect(ids({ sort: "priority" }).slice(0, 3)).toEqual(["Write brief", "Plan trip", "Call bank"]);
  });
  it("counts and labels", () => {
    expect(boardStats(tasks, TODAY)).toEqual({ open: 4, overdue: 1, week: 2 });
    expect(flagDate("2026-11-06", TODAY)).toBe("Tomorrow");
    expect(flagDate("2026-11-20", TODAY)).toBe("Nov 20");
    expect(flagDate("2027-01-02", TODAY)).toBe("Jan 2, 2027");
  });
});

import { dropTask } from "./tasks";

describe("drag to reorder", () => {
  const r = (id: string, position: number, o: Partial<{ scheduledStart: string; dueDate: string; group: string }> = {}) => ({ id, position, scheduledStart: o.scheduledStart ?? null, dueDate: o.dueDate ?? null, group: o.group ?? "g" });
  const list = [r("a", 1024), r("b", 2048), r("c", 3072)];
  it("moves between neighbours", () => {
    expect(dropTask(list, "c", 0)).toEqual({ position: 0 });
    expect(dropTask(list, "a", 3)).toEqual({ position: 4096 });
    expect(dropTask(list, "a", 2)).toEqual({ position: 2560 });
    expect(dropTask(list, "b", 1)).toBeNull(); // same place
  });
  it("skips time blocks and doesn't move them", () => {
    const l = [r("t", 0, { scheduledStart: "2026-11-05T14:00:00Z" }), r("a", 1024), r("b", 2048)];
    expect(dropTask(l, "t", 2)).toBeNull();
    expect(dropTask(l, "b", 0)).toEqual({ position: 0 });
  });
  it("adopts the date of the group it lands in", () => {
    const l = [r("o", 5000, { group: "overdue" }), r("x", 1024, { group: "today" }), r("y", 2048, { group: "today" })];
    const opts = { key: (t: (typeof l)[number]) => t.group, dateOf: (k: string) => (k === "today" ? "2026-11-05" : null) };
    expect(dropTask(l, "o", 2, opts)).toEqual({ position: 1536, dueDate: "2026-11-05" });
    expect(dropTask(l, "y", 0, opts)).toBeNull(); // today → overdue isn't allowed
  });
});
