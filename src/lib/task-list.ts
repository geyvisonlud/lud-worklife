/**
 * Tasks → List (Things-style): one column of open tasks, divided by project (or not), sorted by date, priority or the
 * manual order, filtered by tag. Pure (tested in task-list.test.ts).
 */

export type ListTask = {
  id: string;
  title: string;
  projectId: string | null;
  status: string;
  priority: number;
  position: number;
  dueDate: string | null;
  scheduledStart: string | null;
  tags: string[];
};
export type ListProject = { id: string; name: string; emoji: string | null; color: string };
export type ListSort = "date" | "priority" | "manual";
export type ListGroup = "project" | "none";
export type ListSection<T> = { key: string; title: string; project: ListProject | null; tasks: T[] };

/** The day a task is planned for: its time block's day, else its due date ("9999" = no date, last). */
const dayOf = (t: ListTask, dayOfInstant: (iso: string) => string) => (t.scheduledStart ? dayOfInstant(t.scheduledStart) : (t.dueDate ?? "9999-12-31"));

export function sortTasks<T extends ListTask>(tasks: T[], sort: ListSort, dayOfInstant: (iso: string) => string) {
  const out = [...tasks];
  const time = (t: ListTask) => (t.scheduledStart ? new Date(t.scheduledStart).getTime() : Infinity);
  if (sort === "date") out.sort((a, b) => dayOf(a, dayOfInstant).localeCompare(dayOf(b, dayOfInstant)) || time(a) - time(b) || b.priority - a.priority || a.position - b.position);
  else if (sort === "priority") out.sort((a, b) => b.priority - a.priority || dayOf(a, dayOfInstant).localeCompare(dayOf(b, dayOfInstant)) || a.position - b.position);
  else out.sort((a, b) => a.position - b.position);
  return out;
}

/**
 * Open tasks (with `tag`, when given) in sections: tasks without a project first ("Inbox"), then one section per project
 * in `projects` order (empty projects left out) — or a single section when not grouped.
 */
export function listSections<T extends ListTask>(
  tasks: T[],
  projects: ListProject[],
  opts: { group: ListGroup; sort: ListSort; tag?: string | null; dayOfInstant: (iso: string) => string },
): ListSection<T>[] {
  const open = tasks.filter((t) => t.status !== "done" && (!opts.tag || t.tags.includes(opts.tag)));
  const sorted = sortTasks(open, opts.sort, opts.dayOfInstant);
  if (opts.group === "none") return [{ key: "all", title: "All tasks", project: null, tasks: sorted }];
  const known = new Set(projects.map((p) => p.id));
  const sections: ListSection<T>[] = [{ key: "inbox", title: "Inbox", project: null, tasks: sorted.filter((t) => !t.projectId || !known.has(t.projectId)) }];
  for (const p of projects) sections.push({ key: p.id, title: p.name, project: p, tasks: sorted.filter((t) => t.projectId === p.id) });
  return sections.filter((s) => s.tasks.length > 0);
}

/** Every tag in use on open tasks, most used first. */
export function tagCounts(tasks: ListTask[]) {
  const m = new Map<string, number>();
  for (const t of tasks) if (t.status !== "done") for (const tag of t.tags) m.set(tag, (m.get(tag) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag, count]) => ({ tag, count }));
}

/** Minutes from midnight for a drop at `y` px in a day grid that starts at `startHour` (15-min snap, kept inside the day). */
export function minuteAtY(y: number, pxPerHour: number, startHour: number, durationMin: number) {
  const raw = startHour * 60 + (y / pxPerHour) * 60;
  const snapped = Math.round(raw / 15) * 15;
  return Math.max(0, Math.min(24 * 60 - Math.max(15, durationMin), snapped));
}
