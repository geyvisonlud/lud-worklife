/**
 * Today (home) figures and lists, modeled on a workspace home: the stat strip, "Upcoming deadlines" grouped by day and
 * "Recent activity". Pure (tested in home.test.ts).
 */
import { addDays, daysBetween } from "./dates";

type T = { id: string; title: string; status: string; dueDate: string | null; projectId: string | null; completedAt: string | null };
type P = { id: string; stage: string; dueDate: string | null };

/** Active projects (not done), how many are at risk (past their target date or with overdue tasks), open / due-today /
 *  overdue tasks, and tasks completed in the 7 days up to `today` (`dayOf` turns an instant into a local day). */
export function homeStats(projects: P[], tasks: T[], today: string, dayOf: (iso: string) => string) {
  const open = tasks.filter((t) => t.status !== "done");
  const overdueTasks = open.filter((t) => t.dueDate && t.dueDate < today);
  const active = projects.filter((p) => p.stage !== "done");
  const late = new Set(overdueTasks.map((t) => t.projectId).filter(Boolean));
  const weekStart = addDays(today, -6);
  return {
    activeProjects: active.length,
    atRisk: active.filter((p) => (p.dueDate && p.dueDate < today) || late.has(p.id)).length,
    openTasks: open.length,
    dueToday: open.filter((t) => t.dueDate === today).length,
    overdue: overdueTasks.length,
    completedWeek: tasks.filter((t) => t.status === "done" && t.completedAt && dayOf(t.completedAt) >= weekStart && dayOf(t.completedAt) <= today).length,
  };
}

export type DeadlineGroup<X> = { key: "today" | "tomorrow" | "week"; label: string; items: X[]; more: number };

/** Open tasks and projects due today, tomorrow and later this week (next 7 days), each group capped at `max`. */
export function deadlineGroups<X extends { dueDate: string | null }>(items: X[], today: string, max = 5): DeadlineGroup<X>[] {
  const tomorrow = addDays(today, 1);
  const end = addDays(today, 7);
  const sorted = [...items].filter((x) => x.dueDate && x.dueDate >= today && x.dueDate <= end).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
  const make = (key: DeadlineGroup<X>["key"], label: string, xs: X[]) => ({ key, label, items: xs.slice(0, max), more: Math.max(0, xs.length - max) });
  return [
    make("today", "Today", sorted.filter((x) => x.dueDate === today)),
    make("tomorrow", "Tomorrow", sorted.filter((x) => x.dueDate === tomorrow)),
    make("week", "This week", sorted.filter((x) => x.dueDate! > tomorrow)),
  ].filter((g) => g.items.length);
}

export type Activity = { id: string; verb: "completed" | "added" | "created" | "imported" | "edited"; what: "task" | "project" | "note"; title: string; at: string; href: string };

/** Recent things that happened here, newest first (each item once — its latest event). */
export function recentActivity(
  input: {
    tasks: { id: string; title: string; createdAt: string; completedAt: string | null; fromNotion?: boolean }[];
    projects: { id: string; name: string; createdAt: string; source: string }[];
    notes: { id: string; title: string; createdAt: string; updatedAt: string }[];
  },
  limit = 6,
): Activity[] {
  const out: Activity[] = [];
  for (const t of input.tasks) {
    if (t.completedAt) out.push({ id: `t:${t.id}`, verb: "completed", what: "task", title: t.title, at: t.completedAt, href: `/tasks?task=${t.id}` });
    else out.push({ id: `t:${t.id}`, verb: t.fromNotion ? "imported" : "added", what: "task", title: t.title, at: t.createdAt, href: `/tasks?task=${t.id}` });
  }
  for (const p of input.projects) out.push({ id: `p:${p.id}`, verb: p.source === "notion" ? "imported" : "created", what: "project", title: p.name, at: p.createdAt, href: `/projects/${p.id}` });
  for (const n of input.notes) {
    const edited = new Date(n.updatedAt).getTime() - new Date(n.createdAt).getTime() > 60_000;
    out.push({ id: `n:${n.id}`, verb: edited ? "edited" : "created", what: "note", title: n.title, at: edited ? n.updatedAt : n.createdAt, href: `/notes?n=${n.id}` });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

/** "Due in 3 days" / "Due today" / "2 days late" for a project's target date. */
export function dueLabel(due: string | null, today: string) {
  if (!due) return null;
  const d = daysBetween(today, due);
  if (d === 0) return "Due today";
  if (d === 1) return "Due tomorrow";
  if (d > 1) return `In ${d} days`;
  return d === -1 ? "1 day late" : `${-d} days late`;
}
