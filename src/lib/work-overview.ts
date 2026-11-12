/**
 * Today's "Projects" cards and task table: which projects to show and their figures, and which tasks
 * the table lists for each filter. Pure; tested in work-overview.test.ts.
 */

type P = { id: string; stage: string; position: number; dueDate: string | null };
type T = { id: string; projectId: string | null; status: string; dueDate: string | null };

const STAGE_ORDER: Record<string, number> = { active: 0, planned: 1, hold: 2 };

/** Projects still going (in progress first, then planned, then on hold), each with its open/overdue tasks and next due date. */
export function projectCards<PP extends P>(projects: PP[], tasks: T[], today: string, limit = 6) {
  return projects
    .filter((p) => p.stage in STAGE_ORDER)
    .sort((a, b) => STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage] || a.position - b.position)
    .slice(0, limit)
    .map((p) => {
      const mine = tasks.filter((t) => t.projectId === p.id);
      const open = mine.filter((t) => t.status !== "done");
      const dues = open.map((t) => t.dueDate).filter((d): d is string => Boolean(d)).sort();
      return {
        project: p,
        open: open.length,
        overdue: dues.filter((d) => d < today).length,
        nextDue: dues.find((d) => d >= today) ?? null,
      };
    });
}

export type TaskFilter = "all" | "projects" | "inbox";

/** Open tasks for the table: all, only those in a project, or only those without one. */
export function filterTasks<TT extends T>(tasks: TT[], filter: TaskFilter) {
  const open = tasks.filter((t) => t.status !== "done");
  if (filter === "projects") return open.filter((t) => t.projectId);
  if (filter === "inbox") return open.filter((t) => !t.projectId);
  return open;
}
