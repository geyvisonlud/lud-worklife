import { describe, expect, it } from "vitest";
import { listSections, minuteAtY, sortTasks, tagCounts } from "./task-list";

const day = (iso: string) => iso.slice(0, 10);
const t = (id: string, o: Partial<{ projectId: string | null; status: string; priority: number; position: number; dueDate: string | null; scheduledStart: string | null; tags: string[] }> = {}) => ({
  id,
  title: id,
  projectId: o.projectId ?? null,
  status: o.status ?? "todo",
  priority: o.priority ?? 0,
  position: o.position ?? 0,
  dueDate: o.dueDate ?? null,
  scheduledStart: o.scheduledStart ?? null,
  tags: o.tags ?? [],
});
const projects = [
  { id: "p2", name: "Website", emoji: null, color: "blue" },
  { id: "p1", name: "Church", emoji: "⛪", color: "green" },
  { id: "p3", name: "Empty", emoji: null, color: "teal" },
];
const tasks = [
  t("a", { projectId: "p1", dueDate: "2026-11-20", priority: 1, position: 3, tags: ["work"] }),
  t("b", { projectId: "p1", dueDate: "2026-11-18", priority: 3, position: 2 }),
  t("c", { position: 1, tags: ["work", "home"] }),
  t("d", { projectId: "p2", scheduledStart: "2026-11-17T15:00:00.000Z", position: 5 }),
  t("e", { projectId: "p2", status: "done", tags: ["work"] }),
  t("f", { projectId: "gone", position: 0, priority: 2 }),
];

describe("Things-style list", () => {
  it("divides open tasks by project: Inbox first, then projects in order, empty ones left out", () => {
    const s = listSections(tasks, projects, { group: "project", sort: "manual", dayOfInstant: day });
    expect(s.map((x) => [x.key, x.tasks.map((y) => y.id)])).toEqual([
      ["inbox", ["f", "c"]],
      ["p2", ["d"]],
      ["p1", ["b", "a"]],
    ]);
  });
  it("sorts by date (time blocks by their day) or priority, and filters by tag", () => {
    expect(sortTasks(tasks.slice(0, 4), "date", day).map((x) => x.id)).toEqual(["d", "b", "a", "c"]);
    expect(sortTasks(tasks.slice(0, 4), "priority", day).map((x) => x.id)).toEqual(["b", "a", "d", "c"]);
    const one = listSections(tasks, projects, { group: "none", sort: "date", tag: "work", dayOfInstant: day });
    expect(one).toHaveLength(1);
    expect(one[0].tasks.map((x) => x.id)).toEqual(["a", "c"]);
  });
  it("counts tags on open tasks", () => {
    expect(tagCounts(tasks)).toEqual([
      { tag: "work", count: 2 },
      { tag: "home", count: 1 },
    ]);
  });
  it("turns a drop position into a snapped start time", () => {
    expect(minuteAtY(0, 48, 7, 30)).toBe(420);
    expect(minuteAtY(50, 48, 7, 30)).toBe(480); // 1.04 h → 8:00
    expect(minuteAtY(10_000, 48, 7, 60)).toBe(1380); // kept inside the day
  });
});
