import { describe, expect, it } from "vitest";
import { filterTasks, projectCards } from "./work-overview";

const projects = [
  { id: "a", stage: "planned", position: 1, dueDate: null },
  { id: "b", stage: "active", position: 5, dueDate: null },
  { id: "c", stage: "done", position: 0, dueDate: null },
  { id: "d", stage: "active", position: 2, dueDate: null },
];
const tasks = [
  { id: "1", projectId: "b", status: "todo", dueDate: "2026-11-09" },
  { id: "2", projectId: "b", status: "doing", dueDate: "2026-11-14" },
  { id: "3", projectId: "b", status: "done", dueDate: "2026-11-01" },
  { id: "4", projectId: null, status: "todo", dueDate: null },
];

describe("work overview", () => {
  it("orders projects in progress first and counts their tasks", () => {
    const cards = projectCards(projects, tasks, "2026-11-11");
    expect(cards.map((c) => c.project.id)).toEqual(["d", "b", "a"]);
    expect(cards[1]).toMatchObject({ open: 2, overdue: 1, nextDue: "2026-11-14" });
    expect(cards[0]).toMatchObject({ open: 0, overdue: 0, nextDue: null });
  });
  it("filters the task table", () => {
    expect(filterTasks(tasks, "all").map((t) => t.id)).toEqual(["1", "2", "4"]);
    expect(filterTasks(tasks, "projects").map((t) => t.id)).toEqual(["1", "2"]);
    expect(filterTasks(tasks, "inbox").map((t) => t.id)).toEqual(["4"]);
  });
});
