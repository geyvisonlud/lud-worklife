/**
 * Kanban columns and ordering. Cards keep a fractional `position` so a move only rewrites the moved card.
 */

export const TASK_STATUSES = [
  { key: "backlog", label: "Backlog" },
  { key: "todo", label: "To do" },
  { key: "doing", label: "In progress" },
  { key: "done", label: "Done" },
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number]["key"];

export const PROJECT_STAGES = [
  { key: "planned", label: "Planned" },
  { key: "active", label: "In progress" },
  { key: "hold", label: "On hold" },
  { key: "done", label: "Done" },
] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number]["key"];

export const isTaskStatus = (s: unknown): s is TaskStatus => TASK_STATUSES.some((x) => x.key === s);
export const isProjectStage = (s: unknown): s is ProjectStage => PROJECT_STAGES.some((x) => x.key === s);

export const PRIORITIES = [
  { value: 0, label: "None" },
  { value: 1, label: "Low" },
  { value: 2, label: "Medium" },
  { value: 3, label: "High" },
] as const;

/** A position between two neighbours (either may be missing: top or bottom of the column). */
export function positionBetween(before: number | null | undefined, after: number | null | undefined) {
  if (before == null && after == null) return 1024;
  if (before == null) return (after as number) - 1024;
  if (after == null) return before + 1024;
  return (before + after) / 2;
}

/**
 * Position for a card dropped at `index` in a column whose cards (already excluding the moved card)
 * are in display order.
 */
export function positionAt(column: { position: number }[], index: number) {
  const i = Math.max(0, Math.min(index, column.length));
  return positionBetween(column[i - 1]?.position, column[i]?.position);
}

/** Display order: by position, then oldest first. */
export const byPosition = <T extends { position: number; createdAt?: Date | string }>(a: T, b: T) =>
  a.position - b.position || String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? ""));

/** Share of tasks done (0–1) and counts. */
export function progress(tasks: { status: string }[]) {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;
  return { total, done, pct: total ? done / total : 0 };
}

export const stageLabel = (s: string) => PROJECT_STAGES.find((x) => x.key === s)?.label ?? s;
export const statusLabel = (s: string) => TASK_STATUSES.find((x) => x.key === s)?.label ?? s;
