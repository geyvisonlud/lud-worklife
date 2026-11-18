/**
 * Google Tasks ↔ Task rows, the pure part: scope, mapping both ways and how a change made in Google
 * lands on a task here. Tested in google-tasks.test.ts; the HTTP side is in google-tasks-sync.ts.
 *
 * Google Tasks has a title, notes, a due *date* (no time — the API drops it) and done/not done.
 * Priority, project, duration and the calendar time block stay here only.
 */

export const TASKS_SCOPE = "https://www.googleapis.com/auth/tasks";
export const TASKS_API = "https://tasks.googleapis.com/tasks/v1";
export const hasTasksScope = (scopes: string | null | undefined) => Boolean(scopes?.split(/\s+/).includes(TASKS_SCOPE));

export type GoogleTask = {
  id: string;
  title?: string;
  notes?: string;
  status?: "needsAction" | "completed";
  /** RFC 3339, always midnight UTC of the due date. */
  due?: string;
  completed?: string;
  deleted?: boolean;
  hidden?: boolean;
  updated?: string;
  parent?: string;
};

export function mapGoogleTask(t: GoogleTask) {
  const updated = t.updated ? new Date(t.updated) : new Date(0);
  return {
    externalId: t.id,
    title: (t.title ?? "").trim().slice(0, 300),
    notes: t.notes?.trim() ? t.notes.trim().slice(0, 5000) : null,
    dueDate: t.due && /^\d{4}-\d{2}-\d{2}/.test(t.due) ? t.due.slice(0, 10) : null,
    done: t.status === "completed",
    completedAt: t.completed ? new Date(t.completed) : null,
    deleted: Boolean(t.deleted),
    updated: Number.isNaN(updated.getTime()) ? new Date(0) : updated,
  };
}
export type RemoteTask = ReturnType<typeof mapGoogleTask>;

/** PATCH body for Google from a task here (null clears a field in Google). */
export function googleTaskBody(task: { title: string; notes: string | null; dueDate: string | null; status: string; completedAt?: Date | null }) {
  const done = task.status === "done";
  return {
    title: task.title.slice(0, 1024),
    notes: task.notes ? task.notes.slice(0, 8000) : null,
    due: task.dueDate ? `${task.dueDate}T00:00:00.000Z` : null,
    status: done ? "completed" : "needsAction",
    completed: done ? (task.completedAt ?? new Date()).toISOString() : null,
  };
}

/**
 * Fields to change on a task here after Google says it changed. Done in Google → done here; reopened
 * in Google → back to To do (a "doing"/"backlog" task stays where it is while open in both).
 */
export function applyRemote(local: { title: string; notes: string | null; dueDate: string | null; status: string }, r: RemoteTask, now = new Date()) {
  const data: { title?: string; notes?: string | null; dueDate?: string | null; status?: string; completedAt?: Date | null } = {};
  if (r.title && r.title !== local.title) data.title = r.title;
  if (r.notes !== local.notes) data.notes = r.notes;
  if (r.dueDate !== local.dueDate) data.dueDate = r.dueDate;
  if (r.done && local.status !== "done") {
    data.status = "done";
    data.completedAt = r.completedAt ?? now;
  } else if (!r.done && local.status === "done") {
    data.status = "todo";
    data.completedAt = null;
  }
  return data;
}

/** Shorter, actionable text for Google's "API not enabled" errors (shown on Connections). */
export function friendlyGoogleError(message: string) {
  const m = /(Google [\w ]+?API|Tasks API|Gmail API) has not been used in project (\d+) before or it is disabled/i.exec(message);
  if (m) return `${m[1]} is turned off in your Google Cloud project (${m[2]}). Enable it there, wait a few minutes and sync again.`;
  return message.slice(0, 300);
}
