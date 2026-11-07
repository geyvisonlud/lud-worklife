import { prisma } from "./db";
import { googleApi, googleList } from "./google";
import { accessToken, mirrorTask, removeTaskEvent } from "./google-sync";
import { applyRemote, friendlyGoogleError, googleTaskBody, hasTasksScope, mapGoogleTask, TASKS_API, type GoogleTask } from "./google-tasks";

/**
 * Google Tasks, both ways. Pull: every enabled list of every account; new open tasks are imported,
 * changes made in Google (title, notes, due date, done, deleted) land on the linked task. Push: edits
 * made here are written straight back (`pushGoogleTask`, `deleteGoogleTask`, called by the actions).
 * `googleTaskUpdated` holds Google's version we last saw or wrote, so our own writes aren't pulled back.
 */

const listPath = (externalId: string) => `${TASKS_API}/lists/${encodeURIComponent(externalId)}/tasks`;

export async function syncTaskLists(accountId: string) {
  const account = await prisma.calendarAccount.findUniqueOrThrow({ where: { id: accountId } });
  if (account.provider !== "google" || !hasTasksScope(account.scopes)) return { imported: 0, updated: 0 };
  let imported = 0;
  let updated = 0;
  try {
    const token = await accessToken(account);
    const lists = await googleList<{ id: string; title?: string }>(token, `${TASKS_API}/users/@me/lists`, { maxResults: "100" });
    for (const l of lists) {
      await prisma.googleTaskList.upsert({
        where: { accountId_externalId: { accountId, externalId: l.id } },
        create: { accountId, externalId: l.id, title: l.title || "Tasks" },
        update: { title: l.title || "Tasks" },
      });
    }
    const gone = await prisma.googleTaskList.findMany({ where: { accountId, externalId: { notIn: lists.map((l) => l.id) } }, select: { id: true } });
    if (gone.length) await unlinkLists(gone.map((g) => g.id), true);

    const enabled = await prisma.googleTaskList.findMany({ where: { accountId, enabled: true } });
    for (const list of enabled) {
      const startedAt = new Date();
      // First sync: open tasks only. After that: everything changed since the last sync, deletions included.
      const query: Record<string, string> = list.lastSyncedAt
        ? { updatedMin: new Date(list.lastSyncedAt.getTime() - 60_000).toISOString(), showCompleted: "true", showHidden: "true", showDeleted: "true", maxResults: "100" }
        : { showCompleted: "false", maxResults: "100" };
      const remote = (await googleList<GoogleTask>(token, listPath(list.externalId), query)).map(mapGoogleTask);
      const linked = await prisma.task.findMany({ where: { googleTaskListId: list.id, googleTaskId: { in: remote.map((r) => r.externalId) } } });
      const byGoogleId = new Map(linked.map((t) => [t.googleTaskId, t]));
      let top = (await prisma.task.findFirst({ where: { status: "todo", projectId: null }, orderBy: { position: "asc" } }))?.position ?? 1024;

      for (const r of remote) {
        const local = byGoogleId.get(r.externalId);
        if (!local) {
          if (r.deleted || r.done || !r.title) continue;
          top -= 1024;
          await prisma.task.create({
            data: { title: r.title, notes: r.notes, dueDate: r.dueDate, status: "todo", position: top, googleTaskId: r.externalId, googleTaskListId: list.id, googleTaskUpdated: r.updated },
          });
          imported++;
          continue;
        }
        if (local.googleTaskUpdated && r.updated.getTime() <= local.googleTaskUpdated.getTime()) continue;
        if (r.deleted) {
          await removeTaskEvent(local.id);
          await prisma.task.delete({ where: { id: local.id } });
          updated++;
          continue;
        }
        const data = applyRemote(local, r);
        await prisma.task.update({ where: { id: local.id }, data: { ...data, googleTaskUpdated: r.updated } });
        if (Object.keys(data).length) updated++;
        if ((data.title !== undefined || data.notes !== undefined) && local.googleEventId) await mirrorTask(local.id);
      }
      await prisma.googleTaskList.update({ where: { id: list.id }, data: { lastSyncedAt: startedAt } });
    }
    await prisma.calendarAccount.update({ where: { id: accountId }, data: { tasksSyncedAt: new Date(), tasksError: null } });
    return { imported, updated };
  } catch (e) {
    await prisma.calendarAccount.update({ where: { id: accountId }, data: { tasksSyncedAt: new Date(), tasksError: friendlyGoogleError(String((e as Error).message ?? e)) } });
    throw e;
  }
}

/** Every account with Google Tasks access; one failing account doesn't stop the others. */
export async function syncAllTaskLists() {
  const accounts = await prisma.calendarAccount.findMany({ where: { provider: "google", scopes: { contains: "auth/tasks" } } });
  let imported = 0;
  let updated = 0;
  const errors: string[] = [];
  for (const a of accounts) {
    try {
      const r = await syncTaskLists(a.id);
      imported += r.imported;
      updated += r.updated;
    } catch (e) {
      errors.push(`${a.email} (Google Tasks): ${friendlyGoogleError((e as Error).message)}`);
    }
  }
  return { accounts: accounts.length, imported, updated, errors };
}

/** Tasks of these lists stop being linked (they stay here); `drop` also deletes the list rows. */
export async function unlinkLists(listIds: string[], drop = false) {
  await prisma.task.updateMany({ where: { googleTaskListId: { in: listIds } }, data: { googleTaskId: null, googleTaskListId: null, googleTaskUpdated: null } });
  if (drop) await prisma.googleTaskList.deleteMany({ where: { id: { in: listIds } } });
}

async function linkedTask(taskId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, include: { googleTaskList: { include: { account: true } } } });
  if (!task?.googleTaskId || !task.googleTaskList || task.googleTaskList.account.provider !== "google") return null;
  return { task, list: task.googleTaskList, account: task.googleTaskList.account };
}

/** Writes a linked task's title, notes, due date and done state to Google. Never throws; returns a warning. */
export async function pushGoogleTask(taskId: string): Promise<string | null> {
  const l = await linkedTask(taskId).catch(() => null);
  if (!l) return null;
  try {
    const token = await accessToken(l.account);
    const res = await googleApi<GoogleTask>(token, `${listPath(l.list.externalId)}/${encodeURIComponent(l.task.googleTaskId!)}`, { method: "PATCH", body: googleTaskBody(l.task) });
    if (res?.updated) await prisma.task.update({ where: { id: taskId }, data: { googleTaskUpdated: new Date(res.updated) } });
    return null;
  } catch (e) {
    console.error("pushGoogleTask", e);
    return `Saved here, but Google Tasks wasn't updated: ${friendlyGoogleError((e as Error).message)}`;
  }
}

/** Deletes a linked task in Google too (before it's deleted here). Never throws. */
export async function deleteGoogleTask(taskId: string): Promise<string | null> {
  const l = await linkedTask(taskId).catch(() => null);
  if (!l) return null;
  try {
    const token = await accessToken(l.account);
    await googleApi(token, `${listPath(l.list.externalId)}/${encodeURIComponent(l.task.googleTaskId!)}`, { method: "DELETE" });
    return null;
  } catch (e) {
    const msg = (e as Error).message;
    if (/not found|404/i.test(msg)) return null; // already gone in Google
    return `Deleted here, but not in Google Tasks: ${friendlyGoogleError(msg)}`;
  }
}
