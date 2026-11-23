import { describe, expect, it } from "vitest";
import { deadlineGroups, dueLabel, homeStats, recentActivity } from "./home";

const TODAY = "2026-11-23";
const day = (iso: string) => iso.slice(0, 10);
const t = (id: string, o: Partial<{ status: string; dueDate: string | null; projectId: string | null; completedAt: string | null }> = {}) => ({
  id,
  title: id,
  status: o.status ?? "todo",
  dueDate: o.dueDate ?? null,
  projectId: o.projectId ?? null,
  completedAt: o.completedAt ?? null,
});

describe("home stats", () => {
  it("counts projects, risk, open, overdue and done this week", () => {
    const s = homeStats(
      [
        { id: "a", stage: "active", dueDate: null },
        { id: "b", stage: "planned", dueDate: "2026-11-20" },
        { id: "c", stage: "done", dueDate: null },
        { id: "d", stage: "hold", dueDate: null },
      ],
      [
        t("1", { dueDate: "2026-11-22", projectId: "a" }),
        t("2", { dueDate: TODAY }),
        t("3"),
        t("4", { status: "done", completedAt: "2026-11-20T10:00:00Z" }),
        t("5", { status: "done", completedAt: "2026-11-10T10:00:00Z" }),
      ],
      TODAY,
      day,
    );
    expect(s).toEqual({ activeProjects: 3, atRisk: 2, openTasks: 3, dueToday: 1, overdue: 1, completedWeek: 1 });
  });
});

describe("upcoming deadlines", () => {
  it("groups today, tomorrow and the rest of the week, capped", () => {
    const g = deadlineGroups(
      [{ dueDate: TODAY }, { dueDate: TODAY }, { dueDate: "2026-11-24" }, { dueDate: "2026-11-27" }, { dueDate: "2026-12-10" }, { dueDate: "2026-11-01" }, { dueDate: null }],
      TODAY,
      1,
    );
    expect(g.map((x) => [x.key, x.items.length, x.more])).toEqual([
      ["today", 1, 1],
      ["tomorrow", 1, 0],
      ["week", 1, 0],
    ]);
  });
});

describe("recent activity", () => {
  it("merges tasks, projects and notes, newest first", () => {
    const a = recentActivity({
      tasks: [
        { id: "1", title: "Done one", createdAt: "2026-11-20T09:00:00Z", completedAt: "2026-11-23T09:00:00Z" },
        { id: "2", title: "New one", createdAt: "2026-11-22T09:00:00Z", completedAt: null, fromNotion: true },
      ],
      projects: [{ id: "p", name: "Site", createdAt: "2026-11-21T09:00:00Z", source: "local" }],
      notes: [{ id: "n", title: "Idea", createdAt: "2026-11-19T09:00:00Z", updatedAt: "2026-11-22T12:00:00Z" }],
    });
    expect(a.map((x) => `${x.verb} ${x.what} ${x.title}`)).toEqual(["completed task Done one", "edited note Idea", "imported task New one", "created project Site"]);
    expect(a[0].href).toBe("/tasks?task=1");
  });
  it("labels due dates", () => {
    expect(dueLabel("2026-11-23", TODAY)).toBe("Due today");
    expect(dueLabel("2026-11-26", TODAY)).toBe("In 3 days");
    expect(dueLabel("2026-11-21", TODAY)).toBe("2 days late");
    expect(dueLabel(null, TODAY)).toBeNull();
  });
});
