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

/* ------------------------------------------------------------ board columns */

export type Board = "tasks" | "projects";
/** A column as shown on a board. `color` is a PROJECT_COLORS key or "gray". */
export type BoardColumnDTO = { key: string; label: string; color: string; position: number; hidden: boolean; builtIn: boolean };
type ColumnRow = { key: string; label: string; color: string; position: number; hidden: boolean };

const BUILT_IN_COLORS: Record<string, string> = { backlog: "gray", todo: "gray", doing: "blue", done: "green", planned: "gray", active: "blue", hold: "amber" };

export const builtInColumns = (board: Board): BoardColumnDTO[] =>
  (board === "tasks" ? TASK_STATUSES : PROJECT_STAGES).map((c, i) => ({ key: c.key, label: c.label, color: BUILT_IN_COLORS[c.key] ?? "gray", position: (i + 1) * 1024, hidden: false, builtIn: true }));

/** Built-in columns (with the user's changes, if any) plus custom ones, in board order. */
export function mergeColumns(board: Board, rows: ColumnRow[]): BoardColumnDTO[] {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const builtIn = builtInColumns(board).map((c) => {
    const r = byKey.get(c.key);
    return r ? { ...c, label: r.label || c.label, color: r.color, position: r.position, hidden: r.hidden && c.key !== "done" } : c;
  });
  const custom = rows.filter((r) => isCustomColumn(r.key)).map((r) => ({ ...r, builtIn: false }));
  return [...builtIn, ...custom].sort((a, b) => a.position - b.position || a.label.localeCompare(b.label));
}

export const isCustomColumn = (key: string) => /^c_[a-z0-9]{4,24}$/.test(key);
export const newColumnKey = (rand = Math.random) => `c_${Math.floor(rand() * 36 ** 8).toString(36).padStart(8, "0")}`;
/** A column a card can be in: a built-in one or an existing custom one. */
export const isColumnOf = (board: Board, key: unknown, custom: string[] = []): key is string =>
  typeof key === "string" && ((board === "tasks" ? isTaskStatus(key) : isProjectStage(key)) || (isCustomColumn(key) && custom.includes(key)));
export const columnLabel = (columns: { key: string; label: string }[], key: string) =>
  columns.find((c) => c.key === key)?.label ?? (isCustomColumn(key) ? "Other" : (board(key) === "projects" ? stageLabel(key) : statusLabel(key)));
const board = (key: string): Board => (isProjectStage(key) && !isTaskStatus(key) ? "projects" : "tasks");

/** Position for a column moved to `index` among the other columns (in board order). */
export const columnPositionAt = (others: { position: number }[], index: number) => positionAt(others, index);

/** Checklist progress in task notes ("- [ ]" / "- [x]" lines). */
export function checklist(notes: string | null | undefined) {
  const lines = (notes ?? "").split("\n").filter((l) => /^\s*[-*+]\s+\[[ xX]\]/.test(l));
  return { total: lines.length, done: lines.filter((l) => /\[[xX]\]/.test(l)).length };
}

/** The note's first line that isn't a checklist item — a card's description. */
export function cardDescription(notes: string | null | undefined) {
  return (
    (notes ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !/^[-*+]\s+\[[ xX]\]/.test(l))
      .join(" ")
      .replace(/[#*_`>]/g, "")
      .slice(0, 220) || null
  );
}
