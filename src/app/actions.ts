"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE, SESSION_MAX_AGE, allowedEmails, createSessionToken, passwordOk, verifySessionToken } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { isHex, isProjectColor } from "@/lib/colors";
import { appTimeZone, isYmd, ymdInTz, zonedToUtc } from "@/lib/dates";
import { isProjectStage, isTaskStatus, positionAt } from "@/lib/kanban";
import { accessToken, mirrorTask, removeTaskEvent, syncAccount, syncAllCalendars } from "@/lib/google-sync";
import { googleApi } from "@/lib/google";
import { deleteGoogleTask, pushGoogleTask, syncAllTaskLists, syncTaskLists, unlinkLists } from "@/lib/google-tasks-sync";
import { findUserByEmail, notionApi } from "@/lib/notion";
import { syncAllNotion, syncNotionConnection } from "@/lib/notion-sync";
import { SETTING_KEYS, setSetting } from "@/lib/settings";
import { gmailLink, taskNotesFromEmail } from "@/lib/email";
import { scanAllEmail } from "@/lib/email-sync";
import { findQuote, isQuoteKind } from "@/lib/daily";
import { PLAN_DAYS } from "@/lib/bible-plan";
import { normalizeTags, noteEvent, noteTitle, plainText } from "@/lib/notes";
import { buildEvent } from "@/lib/events";
import { extractLinks } from "@/lib/read-later";
import { importLinks, newCaptureToken, readerView, saveToReadLater, type ReaderView } from "@/lib/read-later-data";
import { articleToMarkdown } from "@/lib/reader";
import { pushToAll, saveNotifyPrefs, vapidKeys } from "@/lib/notify-data";
import { parsePrefs, type NotifyPrefs } from "@/lib/notify";
import { listNotes, type NoteDTO } from "@/lib/notes-data";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

const done = (message?: string | null): ActionResult => {
  revalidatePath("/", "layout");
  return message ? { ok: true, message } : { ok: true };
};
const fail = (error: string): ActionResult => ({ ok: false, error });
const clean = (s: unknown, max = 500) => (typeof s === "string" ? s.trim().slice(0, max) : "");

/* ----------------------------------------------------------------- login */

export async function login(_: unknown, form: FormData) {
  if (!passwordOk(String(form.get("password") ?? ""))) return { error: "Wrong password." };
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await createSessionToken(), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: SESSION_MAX_AGE, path: "/" });
  const next = String(form.get("next") || "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

/* ----------------------------------------------------------------- tasks */

export type TaskInput = {
  title?: string;
  notes?: string | null;
  projectId?: string | null;
  status?: string;
  priority?: number;
  dueDate?: string | null;
  durationMin?: number;
  /** ISO instant, or null to unschedule. */
  scheduledStart?: string | null;
};

function taskData(input: TaskInput) {
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = clean(input.title, 300) || "Untitled task";
  if (input.notes !== undefined) data.notes = clean(input.notes, 5000) || null;
  if (input.projectId !== undefined) data.projectId = input.projectId || null;
  if (input.status !== undefined && isTaskStatus(input.status)) {
    data.status = input.status;
    data.completedAt = input.status === "done" ? new Date() : null;
  }
  if (input.priority !== undefined) data.priority = Math.max(0, Math.min(3, Math.round(Number(input.priority) || 0)));
  if (input.dueDate !== undefined) data.dueDate = isYmd(input.dueDate) ? input.dueDate : null;
  if (input.durationMin !== undefined) data.durationMin = Math.max(5, Math.min(12 * 60, Math.round(Number(input.durationMin) || 30)));
  if (input.scheduledStart !== undefined) {
    const d = input.scheduledStart ? new Date(input.scheduledStart) : null;
    data.scheduledStart = d && !Number.isNaN(d.getTime()) ? d : null;
  }
  return data;
}

export async function createTask(input: TaskInput): Promise<ActionResult & { id?: string }> {
  if (!clean(input.title)) return fail("Give the task a title.");
  const status = isTaskStatus(input.status) ? input.status : "todo";
  // New tasks go to the top of their column.
  const first = await prisma.task.findFirst({ where: { status, projectId: input.projectId || null }, orderBy: { position: "asc" } });
  const t = await prisma.task.create({ data: { title: "", ...taskData({ ...input, status }), position: (first?.position ?? 1024) - 1024 } as never });
  const warn = t.scheduledStart ? await mirrorTask(t.id) : null;
  return { ...done(warn), id: t.id };
}

export async function updateTask(id: string, input: TaskInput): Promise<ActionResult> {
  const before = await prisma.task.findUnique({ where: { id } });
  if (!before) return fail("That task no longer exists.");
  const data = taskData(input);
  if (data.status === before.status) delete data.completedAt; // keep the original completion time
  const after = await prisma.task.update({ where: { id }, data });
  const timeChanged =
    before.scheduledStart?.getTime() !== after.scheduledStart?.getTime() || before.durationMin !== after.durationMin || before.title !== after.title || before.notes !== after.notes;
  const warn = timeChanged && (after.scheduledStart || before.googleEventId) ? await mirrorTask(id) : null;
  const inTasks =
    after.googleTaskId && (before.title !== after.title || before.notes !== after.notes || before.dueDate !== after.dueDate || (before.status === "done") !== (after.status === "done"));
  const warnTasks = inTasks ? await pushGoogleTask(id) : null;
  return done(warn ?? warnTasks);
}

export async function toggleTask(id: string, isDone: boolean) {
  return updateTask(id, { status: isDone ? "done" : "todo" });
}

/** Drop on the calendar (start = ISO instant) or back in the tray (start = null). */
export async function scheduleTask(id: string, start: string | null, durationMin?: number) {
  return updateTask(id, { scheduledStart: start, ...(durationMin ? { durationMin } : {}) });
}

/**
 * Kanban move: `status` column, dropped at `index` among the column's other cards.
 * `projectId` scopes the column to one project's board (undefined = all tasks).
 */
export async function moveTask(id: string, status: string, index: number, projectId?: string | null) {
  if (!isTaskStatus(status)) return fail("Unknown column.");
  const column = await prisma.task.findMany({
    where: { status, id: { not: id }, ...(projectId !== undefined ? { projectId } : {}) },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { position: true },
  });
  const t = await prisma.task.findUnique({ where: { id } });
  if (!t) return fail("That task no longer exists.");
  await prisma.task.update({
    where: { id },
    data: { status, position: positionAt(column, index), ...(status !== t.status ? { completedAt: status === "done" ? new Date() : null } : {}) },
  });
  const warn = t.googleTaskId && (t.status === "done") !== (status === "done") ? await pushGoogleTask(id) : null;
  return done(warn);
}

export async function deleteTask(id: string) {
  const warnTasks = await deleteGoogleTask(id);
  const warn = (await removeTaskEvent(id)) ?? warnTasks;
  await prisma.task.deleteMany({ where: { id } });
  return done(warn);
}

/* -------------------------------------------------------------- projects */

export type ProjectInput = { name?: string; description?: string | null; emoji?: string | null; color?: string; stage?: string; dueDate?: string | null; archived?: boolean };

function projectData(input: ProjectInput) {
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = clean(input.name, 200) || "Untitled project";
  if (input.description !== undefined) data.description = clean(input.description, 2000) || null;
  if (input.emoji !== undefined) data.emoji = clean(input.emoji, 8) || null;
  if (input.color !== undefined && isProjectColor(input.color)) data.color = input.color;
  if (input.stage !== undefined && isProjectStage(input.stage)) data.stage = input.stage;
  if (input.dueDate !== undefined) data.dueDate = isYmd(input.dueDate) ? input.dueDate : null;
  if (input.archived !== undefined) data.archived = Boolean(input.archived);
  return data;
}

export async function createProject(input: ProjectInput): Promise<ActionResult & { id?: string }> {
  if (!clean(input.name)) return fail("Give the project a name.");
  const stage = isProjectStage(input.stage) ? input.stage : "planned";
  const first = await prisma.project.findFirst({ where: { stage }, orderBy: { position: "asc" } });
  const p = await prisma.project.create({ data: { name: "", ...projectData({ ...input, stage }), position: (first?.position ?? 1024) - 1024 } as never });
  return { ...done(), id: p.id };
}

export async function updateProject(id: string, input: ProjectInput) {
  const data = projectData(input);
  if (data.stage) data.stageOverridden = true;
  await prisma.project.update({ where: { id }, data });
  return done();
}

export async function moveProject(id: string, stage: string, index: number) {
  if (!isProjectStage(stage)) return fail("Unknown column.");
  const column = await prisma.project.findMany({
    where: { stage, archived: false, id: { not: id } },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { position: true },
  });
  // Moving a Notion project by hand stops Notion's status from moving it back.
  await prisma.project.update({ where: { id }, data: { stage, position: positionAt(column, index), stageOverridden: true } });
  return done();
}

/** Deleting a project keeps its tasks (they move to the inbox) unless asked otherwise. */
export async function deleteProject(id: string, withTasks = false) {
  if (withTasks) {
    for (const t of await prisma.task.findMany({ where: { projectId: id }, select: { id: true, googleEventId: true } })) {
      if (t.googleEventId) await removeTaskEvent(t.id);
    }
    await prisma.task.deleteMany({ where: { projectId: id } });
  }
  await prisma.project.delete({ where: { id } });
  revalidatePath("/", "layout");
  redirect("/projects");
}

/* ------------------------------------------------------------- calendars */

export async function setCalendarVisible(id: string, visible: boolean) {
  const cal = await prisma.calendar.update({ where: { id }, data: { visible } });
  if (visible) await syncAccount(cal.accountId).catch(() => {});
  else await prisma.event.deleteMany({ where: { calendarId: id } });
  return done();
}

export async function setCalendarColor(id: string, color: string | null) {
  await prisma.calendar.update({ where: { id }, data: { customColor: color && isHex(color) ? color.toLowerCase() : null } });
  return done();
}

export async function disconnectCalendarAccount(id: string) {
  const cals = await prisma.calendar.findMany({ where: { accountId: id }, select: { id: true } });
  // Tasks mirrored into this account just lose the link (the Google events stay in Google).
  await prisma.task.updateMany({ where: { googleCalendarId: { in: cals.map((c) => c.id) } }, data: { googleEventId: null, googleCalendarId: null } });
  // Tasks from its Google Tasks lists stay here, unlinked.
  const lists = await prisma.googleTaskList.findMany({ where: { accountId: id }, select: { id: true } });
  await unlinkLists(lists.map((l) => l.id));
  await prisma.calendarAccount.delete({ where: { id } });
  return done();
}

export async function syncCalendarsNow(): Promise<ActionResult> {
  const r = await syncAllCalendars();
  if (r.errors.length) return fail(r.errors.join(" · "));
  return done(r.accounts ? `${r.events} events from ${r.accounts} account${r.accounts === 1 ? "" : "s"}` : "No Google accounts connected yet");
}

/** Called when the calendar opens: syncs if the last sync is older than 5 minutes. */
export async function syncIfStale() {
  const last = await prisma.calendarAccount.findFirst({ where: { provider: "google" }, orderBy: { lastSyncedAt: "asc" } });
  if (!last || (last.lastSyncedAt && Date.now() - last.lastSyncedAt.getTime() < 5 * 60_000)) return { synced: false };
  await syncAllCalendars();
  revalidatePath("/", "layout");
  return { synced: true };
}

/* ---------------------------------------------------------- Google Tasks */

/** Turn a Google Tasks list on (imported and kept in sync) or off (its tasks stay here, unlinked). */
export async function setTaskListEnabled(id: string, enabled: boolean): Promise<ActionResult> {
  const list = await prisma.googleTaskList.update({ where: { id }, data: { enabled, lastSyncedAt: null } });
  if (!enabled) {
    await unlinkLists([id]);
    return done();
  }
  try {
    const r = await syncTaskLists(list.accountId);
    revalidatePath("/", "layout");
    return done(r.imported ? `${r.imported} task${r.imported === 1 ? "" : "s"} imported from ${list.title}` : undefined);
  } catch (e) {
    return fail((e as Error).message);
  }
}

/** Called when Today or Tasks opens: pulls Google Tasks if the last pull is older than 3 minutes. */
export async function syncGoogleTasksIfStale() {
  const stale = await prisma.calendarAccount.findFirst({
    where: { provider: "google", scopes: { contains: "auth/tasks" }, OR: [{ tasksSyncedAt: null }, { tasksSyncedAt: { lt: new Date(Date.now() - 3 * 60_000) } }] },
  });
  if (!stale) return { synced: false };
  const r = await syncAllTaskLists();
  if (r.imported || r.updated) revalidatePath("/", "layout");
  return { synced: r.imported + r.updated > 0 };
}

/* ---------------------------------------------------------------- Notion */

/** Internal integration: paste its secret; "me" is found by email among the workspace's members. */
export async function connectNotionToken(_: unknown, form: FormData): Promise<ActionResult> {
  const token = clean(form.get("token"), 200);
  let email = clean(form.get("email"), 200).toLowerCase();
  if (!/^(secret_|ntn_)/.test(token)) return fail("That doesn't look like a Notion integration secret (it starts with ntn_ or secret_).");
  if (!email) {
    const who = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
    email = who?.split("|")[1] ?? allowedEmails()[0] ?? "";
  }
  if (!email) return fail("Enter the email you use in Notion.");
  try {
    const bot = await notionApi<{ bot?: { workspace_name?: string; workspace_id?: string } }>(token, "/users/me");
    const me = await findUserByEmail(token, email);
    if (!me) return fail(`No member with ${email} in that workspace. Check the email, or turn on “Read user information including email addresses” in the integration's capabilities.`);
    const workspaceId = bot.bot?.workspace_id ?? `token:${token.slice(-8)}`;
    const data = {
      method: "token",
      workspaceName: bot.bot?.workspace_name || "Notion",
      accessToken: encrypt(token),
      userId: me.id,
      userName: me.name,
      userEmail: me.email,
      status: "OK",
      lastError: null,
    };
    const conn = await prisma.notionConnection.upsert({ where: { workspaceId }, create: { workspaceId, ...data }, update: data });
    const r = await syncNotionConnection(conn).catch((e) => ({ error: (e as Error).message }));
    if ("error" in r) return done(`Connected, but the first import failed: ${r.error}`);
    return done(`Connected ${data.workspaceName} — ${r.imported} page${r.imported === 1 ? "" : "s"} imported`);
  } catch (e) {
    return fail(`Notion said: ${(e as Error).message}`);
  }
}

export async function disconnectNotion(id: string) {
  await prisma.notionConnection.delete({ where: { id } });
  return done();
}

export async function syncNotionNow(): Promise<ActionResult> {
  const r = await syncAllNotion();
  if (r.errors.length) return fail(r.errors.join(" · "));
  if (!r.connections) return fail("Connect a Notion workspace first.");
  return done(`${r.imported} new · ${r.updated} updated · ${r.tasks} new to-dos`);
}

/** Re-import one page from scratch (e.g. after it was edited). */
export async function refreshNotionProject(id: string) {
  await prisma.project.update({ where: { id }, data: { notionEditedAt: null } });
  return syncNotionNow();
}

/* ------------------------------------------------------- email suggestions */

/** "Add task": the suggestion becomes a real task (with a link back to the email). */
export async function acceptEmailSuggestion(id: string, edit?: { title?: string; dueDate?: string | null }): Promise<ActionResult> {
  const s = await prisma.emailSuggestion.findUnique({ where: { id }, include: { account: true } });
  if (!s || s.status !== "pending") return fail("That suggestion is gone.");
  const first = await prisma.task.findFirst({ where: { status: "todo", projectId: null }, orderBy: { position: "asc" } });
  const dueDate = edit?.dueDate !== undefined ? edit.dueDate : s.dueDate;
  const task = await prisma.task.create({
    data: {
      title: clean(edit?.title, 300) || s.title || s.subject,
      notes: taskNotesFromEmail(s, gmailLink(s.account.email, s.threadId)),
      dueDate: isYmd(dueDate) ? dueDate : null,
      priority: s.priority,
      position: (first?.position ?? 1024) - 1024,
    },
  });
  await prisma.emailSuggestion.update({ where: { id }, data: { status: "accepted", taskId: task.id } });
  return done("Added to your tasks");
}

export async function dismissEmailSuggestion(id: string): Promise<ActionResult> {
  await prisma.emailSuggestion.updateMany({ where: { id, status: "pending" }, data: { status: "dismissed" } });
  return done();
}

export async function scanEmailNow(): Promise<ActionResult> {
  const r = await scanAllEmail();
  if (r.errors.length) return fail(r.errors.join(" · "));
  if (!r.accounts) return fail("Connect a Google account with Gmail access first (Connections).");
  return done(r.suggested ? `${r.suggested} possible task${r.suggested === 1 ? "" : "s"} from ${r.read} new email${r.read === 1 ? "" : "s"}` : `${r.read} new email${r.read === 1 ? "" : "s"} — nothing needs you`);
}

/** Called when Today opens: scans if the last scan is older than 15 minutes. */
export async function scanEmailIfStale() {
  const stale = await prisma.calendarAccount.findFirst({
    where: { provider: "google", emailEnabled: true, scopes: { contains: "gmail.readonly" }, OR: [{ lastEmailScanAt: null }, { lastEmailScanAt: { lt: new Date(Date.now() - 15 * 60_000) } }] },
  });
  if (!stale) return { scanned: false };
  await scanAllEmail();
  revalidatePath("/", "layout");
  return { scanned: true };
}

export async function setEmailEnabled(accountId: string, enabled: boolean) {
  await prisma.calendarAccount.update({ where: { id: accountId }, data: { emailEnabled: enabled } });
  if (!enabled) await prisma.emailSuggestion.updateMany({ where: { accountId, status: "pending" }, data: { status: "dismissed" } });
  return done();
}

/* ---------------------------------------------------------------- habits */

export type HabitInput = { name?: string; emoji?: string | null; color?: string; targetPerWeek?: number };

function habitData(input: HabitInput) {
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = clean(input.name, 120) || "New habit";
  if (input.emoji !== undefined) data.emoji = clean(input.emoji, 8) || null;
  if (input.color !== undefined && isProjectColor(input.color)) data.color = input.color;
  if (input.targetPerWeek !== undefined) data.targetPerWeek = Math.max(1, Math.min(7, Math.round(Number(input.targetPerWeek) || 7)));
  return data;
}

export async function createHabit(input: HabitInput): Promise<ActionResult> {
  if (!clean(input.name)) return fail("Give the habit a name.");
  const last = await prisma.habit.findFirst({ orderBy: { position: "desc" } });
  await prisma.habit.create({ data: { name: "", ...habitData(input), position: (last?.position ?? 0) + 1024 } as never });
  return done("Habit added");
}

export async function updateHabit(id: string, input: HabitInput): Promise<ActionResult> {
  await prisma.habit.update({ where: { id }, data: habitData(input) });
  return done();
}

/** Archive keeps the history; the habit leaves the daily checklist. */
export async function setHabitArchived(id: string, archived: boolean): Promise<ActionResult> {
  await prisma.habit.update({ where: { id }, data: { archived } });
  return done(archived ? "Archived — its history is kept" : "Back on your list");
}

export async function deleteHabit(id: string): Promise<ActionResult> {
  await prisma.habit.deleteMany({ where: { id } });
  return done("Habit deleted");
}

/** Tick or untick a day (today, or a past day you forgot). Future days can't be ticked. */
export async function setHabitDone(habitId: string, day: string, isDone: boolean): Promise<ActionResult> {
  if (!isYmd(day)) return fail("Invalid day.");
  if (day > ymdInTz(new Date(), appTimeZone())) return fail("That day hasn't happened yet.");
  if (isDone) await prisma.habitCheck.upsert({ where: { habitId_day: { habitId, day } }, create: { habitId, day }, update: {} });
  else await prisma.habitCheck.deleteMany({ where: { habitId, day } });
  return done();
}

/* ----------------------------------------------------- Bible in a year */

/** Starts (or restarts) the plan on a date; restarting clears the days marked as read. */
export async function startBiblePlan(start: string, restart = false): Promise<ActionResult> {
  if (!isYmd(start)) return fail("Pick a start date.");
  await setSetting(SETTING_KEYS.biblePlanStart, start);
  if (restart) await prisma.bibleDay.deleteMany();
  return done(restart ? "Plan restarted" : "Plan started — day 1 is ready");
}

export async function setBibleDayRead(day: number, read: boolean): Promise<ActionResult> {
  if (!Number.isInteger(day) || day < 1 || day > PLAN_DAYS) return fail("Invalid day.");
  if (read) await prisma.bibleDay.upsert({ where: { day }, create: { day }, update: {} });
  else await prisma.bibleDay.deleteMany({ where: { day } });
  return done();
}

/* ------------------------------------------------------- saved quotes */

/** Heart on Today's stoic thought / verse: saves a copy, or removes it. */
export async function setQuoteSaved(kind: string, key: string, saved: boolean): Promise<ActionResult> {
  if (!isQuoteKind(kind)) return fail("Unknown kind.");
  if (!saved) {
    await prisma.savedQuote.deleteMany({ where: { kind, key } });
    return done();
  }
  const q = findQuote(kind, key);
  if (!q) return fail("That quote no longer exists.");
  await prisma.savedQuote.upsert({ where: { kind_key: { kind, key } }, create: { kind, key, ...q }, update: {} });
  return done("Saved");
}

export async function deleteSavedQuote(id: string): Promise<ActionResult> {
  await prisma.savedQuote.deleteMany({ where: { id } });
  return done();
}

/* -------------------------------------------------------------- settings */

export async function saveSettings(form: FormData) {
  const cal = clean(form.get("taskCalendarId"), 100);
  const dur = Math.max(5, Math.min(480, Number(form.get("defaultDuration")) || 30));
  const week = form.get("weekStart") === "1" ? "1" : "0";
  if (cal && !(await prisma.calendar.findFirst({ where: { id: cal, canWrite: true } }))) return;
  await setSetting(SETTING_KEYS.taskCalendar, cal);
  await setSetting(SETTING_KEYS.defaultDuration, String(dur));
  await setSetting(SETTING_KEYS.weekStart, week);
  revalidatePath("/", "layout");
}

/* ----------------------------------------------------------------- notes */

export type NoteInput = { title?: string; body?: string; folderId?: string | null; tags?: string[] | string; pinned?: boolean; color?: string | null };

function noteData(input: NoteInput) {
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = clean(input.title, 200);
  if (input.body !== undefined) data.body = typeof input.body === "string" ? input.body.slice(0, 100_000) : "";
  if (input.folderId !== undefined) data.folderId = input.folderId || null;
  if (input.tags !== undefined) data.tags = normalizeTags(input.tags);
  if (input.pinned !== undefined) data.pinned = Boolean(input.pinned);
  if (input.color !== undefined) data.color = isProjectColor(input.color) ? input.color : null;
  return data;
}

export async function createNote(input: NoteInput = {}): Promise<ActionResult & { id?: string }> {
  if (input.folderId && !(await prisma.noteFolder.findUnique({ where: { id: input.folderId } }))) input.folderId = null;
  const n = await prisma.note.create({ data: noteData(input) });
  return { ...done(), id: n.id };
}

/** Autosave from the editor: no page refresh needed, so it skips revalidation unless asked. */
export async function updateNote(id: string, input: NoteInput, refresh = false): Promise<ActionResult & { updatedAt?: string }> {
  const n = await prisma.note.update({ where: { id }, data: noteData(input) }).catch(() => null);
  if (!n) return fail("That note no longer exists.");
  if (refresh) revalidatePath("/", "layout");
  return { ok: true, updatedAt: n.updatedAt.toISOString() };
}

export async function deleteNote(id: string) {
  await prisma.note.deleteMany({ where: { id } });
  return done("Note deleted");
}

/** Search for the Notes box on Today. */
export async function findNotes(q: string): Promise<NoteDTO[]> {
  return listNotes({ q: clean(q, 200), take: 8 });
}

export async function createFolder(name: string): Promise<ActionResult & { id?: string }> {
  const n = clean(name, 60);
  if (!n) return fail("Give the folder a name.");
  const last = await prisma.noteFolder.findFirst({ orderBy: { position: "desc" } });
  const f = await prisma.noteFolder.create({ data: { name: n, position: (last?.position ?? 0) + 1024 } });
  return { ...done(), id: f.id };
}

export async function renameFolder(id: string, name: string) {
  const n = clean(name, 60);
  if (!n) return fail("Give the folder a name.");
  await prisma.noteFolder.update({ where: { id }, data: { name: n } });
  return done();
}

/** Its notes stay, without a folder. */
export async function deleteFolder(id: string) {
  await prisma.noteFolder.deleteMany({ where: { id } });
  return done("Folder deleted — its notes are in the Inbox");
}

/** A project named after the note, with its text as the description (the note stays, linked to it). */
export async function noteToProject(id: string): Promise<ActionResult & { projectId?: string }> {
  const n = await prisma.note.findUnique({ where: { id } });
  if (!n) return fail("That note no longer exists.");
  const r = await createProject({ name: noteTitle(n).slice(0, 200), description: plainText(n.body).slice(0, 2000), color: n.color ?? "blue", stage: "planned" });
  if (!r.ok || !r.id) return r;
  await prisma.note.update({ where: { id }, data: { projectId: r.id } });
  return { ...done("Project created"), projectId: r.id };
}

/**
 * An event made from the note in one of your calendars (Google calendars get it in Google too).
 * `time` "HH:MM" or null for all day; the event links back to the note.
 */
export async function noteToEvent(id: string, input: { calendarId: string; date: string; time: string | null; durationMin: number }): Promise<ActionResult> {
  const n = await prisma.note.findUnique({ where: { id } });
  if (!n) return fail("That note no longer exists.");
  if (!isYmd(input.date)) return fail("Pick a date.");
  const cal = await prisma.calendar.findUnique({ where: { id: input.calendarId }, include: { account: true } });
  if (!cal || !cal.canWrite) return fail("Pick a calendar you can add events to.");
  const tz = appTimeZone();
  const e = noteEvent(n, { date: input.date, time: input.time, durationMin: Number(input.durationMin) || 60, tz }, zonedToUtc, process.env.APP_URL);
  try {
    const ev = await insertEvent(cal, e.google, { title: e.title, description: e.description ?? null, start: e.start, end: e.end, allDay: e.allDay });
    if (!cal.visible) {
      await prisma.calendar.update({ where: { id: cal.id }, data: { visible: true } });
      if (cal.account.provider === "google") await syncAccount(cal.accountId).catch(() => {});
    }
    await prisma.note.update({ where: { id }, data: { eventId: ev.id } });
    return done(`Added to ${cal.name}`);
  } catch (err) {
    return fail(`Couldn't add the event: ${(err as Error).message}`);
  }
}

/* ---------------------------------------------------------------- events */

type WritableCalendar = NonNullable<Awaited<ReturnType<typeof writableCalendar>>>;
async function writableCalendar(id: string) {
  const cal = await prisma.calendar.findUnique({ where: { id }, include: { account: true } });
  return cal?.canWrite ? cal : null;
}

/** Creates the event in Google (for Google calendars) and stores it here right away, so it shows before the next sync. */
async function insertEvent(
  cal: WritableCalendar,
  google: Record<string, unknown>,
  row: { title: string; description: string | null; location?: string | null; start: Date; end: Date; allDay: boolean },
) {
  let externalId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let htmlLink: string | null = null;
  if (cal.account.provider === "google") {
    const token = await accessToken(cal.account);
    const created = await googleApi<{ id: string; htmlLink?: string }>(token, `/calendars/${encodeURIComponent(cal.externalId)}/events`, { method: "POST", body: google });
    externalId = created.id;
    htmlLink = created.htmlLink ?? null;
  }
  return prisma.event.create({ data: { calendarId: cal.id, externalId, htmlLink, location: row.location ?? null, ...row } });
}

export type EventInput = { calendarId: string; title: string; date: string; allDay: boolean; start: string; end: string; endDate?: string; location?: string; description?: string };

/** New event from the calendar (drag on the grid, or "New"). Times are "HH:MM" in the app's time zone. */
export async function createEvent(input: EventInput): Promise<ActionResult> {
  if (!isYmd(input.date)) return fail("Pick a day.");
  const cal = await writableCalendar(input.calendarId);
  if (!cal) return fail("Pick a calendar you can add events to.");
  const e = eventFromInput(input);
  if (!e) return fail("Pick a start and end time.");
  try {
    await insertEvent(cal, e.google, e.row);
    // Events of hidden calendars aren't shown here — show the calendar you just added to.
    if (!cal.visible) {
      await prisma.calendar.update({ where: { id: cal.id }, data: { visible: true } });
      if (cal.account.provider === "google") await syncAccount(cal.accountId).catch(() => {});
      return done(`Added to ${cal.name} — that calendar was hidden here, so it's shown now`);
    }
    return done(`Added to ${cal.name}`);
  } catch (err) {
    return fail(`Couldn't add the event: ${(err as Error).message}`);
  }
}

function eventFromInput(input: Omit<EventInput, "calendarId">) {
  const toMin = (t: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(t ?? "");
    return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
  };
  const startMin = toMin(input.start);
  const endMin = toMin(input.end);
  if (!isYmd(input.date)) return null;
  if (!input.allDay && (Number.isNaN(startMin) || Number.isNaN(endMin))) return null;
  return buildEvent(
    {
      title: clean(input.title, 300),
      date: input.date,
      allDay: Boolean(input.allDay),
      startMin,
      endMin,
      endDate: isYmd(input.endDate) ? input.endDate : undefined,
      location: clean(input.location, 300),
      description: typeof input.description === "string" ? input.description.slice(0, 8000) : "",
    },
    appTimeZone(),
    zonedToUtc,
  );
}

/** Edit an event: in Google too for Google calendars (a repeating event's occurrence changes on its own). */
export async function updateEvent(id: string, input: Omit<EventInput, "calendarId">): Promise<ActionResult> {
  const ev = await prisma.event.findUnique({ where: { id }, include: { calendar: { include: { account: true } } } });
  if (!ev) return fail("That event is gone — it may have been deleted in Google.");
  if (!ev.calendar.canWrite) return fail("This calendar is read-only.");
  const e = eventFromInput(input);
  if (!e) return fail("Pick a day, and a start and end time.");
  try {
    if (ev.calendar.account.provider === "google") {
      const token = await accessToken(ev.calendar.account);
      // null clears what was removed here (location / description)
      const body = { ...e.google, location: e.google.location ?? null, description: e.google.description ?? null };
      await googleApi(token, `/calendars/${encodeURIComponent(ev.calendar.externalId)}/events/${encodeURIComponent(ev.externalId)}`, { method: "PATCH", body });
    }
    await prisma.event.update({ where: { id }, data: e.row });
    return done("Event updated");
  } catch (err) {
    return fail(`Couldn't update the event: ${(err as Error).message}`);
  }
}

/** Delete an event (in Google too). For a repeating event only this occurrence is removed. */
export async function deleteEvent(id: string): Promise<ActionResult> {
  const ev = await prisma.event.findUnique({ where: { id }, include: { calendar: { include: { account: true } } } });
  if (!ev) return done();
  if (!ev.calendar.canWrite) return fail("This calendar is read-only.");
  try {
    if (ev.calendar.account.provider === "google") {
      const token = await accessToken(ev.calendar.account);
      await googleApi(token, `/calendars/${encodeURIComponent(ev.calendar.externalId)}/events/${encodeURIComponent(ev.externalId)}`, { method: "DELETE" }).catch((err: Error) => {
        // Already gone in Google: just remove it here.
        if (!/not found|deleted|410|404/i.test(err.message)) throw err;
      });
    }
    await prisma.event.delete({ where: { id } });
    return done("Event deleted");
  } catch (err) {
    return fail(`Couldn't delete the event: ${(err as Error).message}`);
  }
}

/* ------------------------------------------------------------ read later */

export async function addReadLater(text: string): Promise<ActionResult> {
  const item = await saveToReadLater({ text: clean(text, 20_000), via: "app" });
  if (!item) return fail("Paste a link or write something to keep.");
  revalidatePath("/read-later");
  return done(`Saved: ${item.title}`);
}

export async function setReadStatus(id: string, read: boolean): Promise<ActionResult> {
  await prisma.readItem.update({ where: { id }, data: { status: read ? "read" : "unread", readAt: read ? new Date() : null } }).catch(() => null);
  return done();
}

export async function deleteReadItem(id: string): Promise<ActionResult> {
  await prisma.readItem.deleteMany({ where: { id } });
  return done();
}

/** Import an export file (Instagram saved_posts.json, Chrome reading list / bookmarks, any file with links). */
export async function importReadLater(form: FormData): Promise<ActionResult> {
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return fail("Choose a file to import.");
  if (file.size > 8 * 1024 * 1024) return fail("That file is too big (8 MB max) — export just the saved items.");
  const links = extractLinks(await file.text());
  if (!links.length) return fail("No links found in that file.");
  const r = await importLinks(links.slice(0, 5000));
  return done(`${r.added} imported${r.skipped ? ` · ${r.skipped} already here` : ""}`);
}

/** Make (or replace) the secret the phone's shortcut sends with each capture. */
export async function resetCaptureToken(): Promise<ActionResult & { token?: string }> {
  const token = await newCaptureToken();
  return { ...done("New capture key — update it in your Shortcut"), token };
}

/** Reader ("Print View") content for an item — fetched and kept on first open. */
export async function getReaderView(id: string): Promise<ReaderView | null> {
  return readerView(id);
}

/** Copy a Read Later item into Notes (Inbox, #read-later): link, summary and the article's text as Markdown. */
export async function saveReadItemToNotes(id: string): Promise<ActionResult & { noteId?: string }> {
  const v = await readerView(id);
  if (!v) return fail("That item is gone.");
  const parts: string[] = [];
  if (v.url) parts.push(`[${v.siteName ?? new URL(v.url).hostname.replace(/^www\./, "")}](${v.url})${v.byline ? ` · ${v.byline}` : ""}`);
  if (v.description && !v.content) parts.push(v.url ? `> ${v.description.replace(/\n/g, "\n> ")}` : v.description);
  if (v.content) parts.push(articleToMarkdown(v.content));
  const item = await prisma.readItem.findUnique({ where: { id }, select: { source: true } });
  const note = await prisma.note.create({
    data: { title: v.title.slice(0, 200), body: parts.join("\n\n").slice(0, 100_000), tags: ["read-later", ...(item && item.source !== "web" && item.source !== "text" ? [item.source] : [])] },
  });
  return { ...done("Saved to Notes"), noteId: note.id };
}

/* --------------------------------------------------------- notifications */

export async function pushPublicKey(): Promise<string> {
  return (await vapidKeys()).publicKey;
}

/** Remember this device for notifications (the browser's push subscription). */
export async function savePushSubscription(sub: { endpoint: string; keys?: { p256dh?: string; auth?: string } }, label: string): Promise<ActionResult> {
  if (!sub?.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) return fail("This browser didn't give a valid subscription.");
  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, label: clean(label, 60) || null },
    update: { p256dh: sub.keys.p256dh, auth: sub.keys.auth, label: clean(label, 60) || null },
  });
  return done("Notifications are on for this device");
}

export async function removePushSubscription(endpointOrId: string): Promise<ActionResult> {
  await prisma.pushSubscription.deleteMany({ where: { OR: [{ endpoint: endpointOrId }, { id: endpointOrId }] } });
  return done("Notifications off for that device");
}

export async function sendTestNotification(): Promise<ActionResult> {
  const n = await pushToAll({ title: "Lud Worklife", body: "Notifications work ✓ — you'll get reminders here.", url: "/", tag: "test" });
  return n ? done(`Sent to ${n} device${n === 1 ? "" : "s"}`) : fail("No device is set up yet — turn notifications on first.");
}

export async function setNotifyPrefs(p: Partial<NotifyPrefs>): Promise<ActionResult> {
  await saveNotifyPrefs(parsePrefs(JSON.stringify(p)));
  return done("Saved");
}
