import type { NotionConnection, Prisma } from "@prisma/client";
import { prisma } from "./db";
import { decrypt } from "./crypto";
import { PROJECT_COLORS } from "./colors";
import {
  assignedVia,
  blocksMention,
  pageBlocks,
  pageDue,
  pageStatus,
  pageTitle,
  parentTitle,
  propertiesMention,
  recentPages,
  simplifyBlocks,
  stageFromStatus,
  summary,
  todosForUser,
  type NotionPage,
} from "./notion";

/** First sync looks this far back; later syncs only at pages edited since the previous one. */
export const NOTION_LOOKBACK_DAYS = Number(process.env.NOTION_LOOKBACK_DAYS || 90);

/** Stable color per Notion parent (all pages of one database share a color). */
function colorFor(key: string) {
  const keys = Object.keys(PROJECT_COLORS).filter((k) => k !== "graphite");
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return keys[h % keys.length];
}

export type ImportResult = { checked: number; imported: number; updated: number; tasks: number };

/** Imports/updates one page if it involves me. Returns what happened. */
export async function importPage(conn: NotionConnection, token: string, page: NotionPage, parents: Map<string, string | null>) {
  const existing = await prisma.project.findUnique({ where: { notionPageId: page.id } });
  // Unchanged since the last import: nothing to do.
  if (existing?.notionEditedAt && existing.notionEditedAt.getTime() >= new Date(page.last_edited_time).getTime()) return "skip" as const;

  const assigned = assignedVia(page.properties, conn.userId);
  const blocks = await pageBlocks(token, page.id);
  const mentioned = propertiesMention(page.properties, conn.userId) || blocksMention(blocks, conn.userId);
  if (!assigned && !mentioned && !existing) return "skip" as const;

  const parentKey = page.parent?.database_id ?? page.parent?.page_id ?? "workspace";
  if (!parents.has(parentKey)) parents.set(parentKey, await parentTitle(token, page.parent));
  const parent = parents.get(parentKey) ?? null;

  const content = simplifyBlocks(blocks, conn.userId);
  const status = pageStatus(page);
  const stage = stageFromStatus(status);
  const fields = {
    name: pageTitle(page),
    emoji: page.icon?.type === "emoji" ? page.icon.emoji ?? null : null,
    notionUrl: page.url,
    notionParent: parent,
    notionWorkspace: conn.workspaceName,
    notionStatus: status,
    notionReason: assigned ? `assigned:${assigned}` : mentioned ? "mentioned" : existing?.notionReason ?? null,
    notionContent: content as unknown as Prisma.InputJsonValue,
    notionEditedAt: new Date(page.last_edited_time),
    notionSyncedAt: new Date(),
    dueDate: pageDue(page),
  };

  let projectId: string;
  let created = false;
  if (existing) {
    await prisma.project.update({
      where: { id: existing.id },
      data: { ...fields, ...(stage && !existing.stageOverridden ? { stage } : {}), ...(existing.description ? {} : { description: summary(content) }) },
    });
    projectId = existing.id;
  } else {
    const s = stage ?? "planned";
    const top = await prisma.project.findFirst({ where: { stage: s }, orderBy: { position: "asc" } });
    const p = await prisma.project.create({
      data: { ...fields, source: "notion", notionPageId: page.id, stage: s, color: colorFor(parentKey), description: summary(content), position: (top?.position ?? 1024) - 1024 },
    });
    projectId = p.id;
    created = true;
  }

  // To-dos that @mention me become tasks of the project.
  let tasks = 0;
  for (const todo of todosForUser(blocks, conn.userId)) {
    const t = await prisma.task.findUnique({ where: { notionBlockId: todo.blockId } });
    if (!t) {
      await prisma.task.create({
        data: {
          title: todo.title,
          projectId,
          notionBlockId: todo.blockId,
          status: todo.checked ? "done" : "todo",
          completedAt: todo.checked ? new Date() : null,
          position: Date.now() / 1000,
        },
      });
      tasks++;
    } else if (todo.checked && t.status !== "done") {
      // Checked off in Notion → done here. (Unchecking in Notion doesn't reopen a task you finished here.)
      await prisma.task.update({ where: { id: t.id }, data: { status: "done", completedAt: new Date() } });
    } else if (t.title !== todo.title) {
      await prisma.task.update({ where: { id: t.id }, data: { title: todo.title } });
    }
  }
  return { created, tasks };
}

export async function syncNotionConnection(conn: NotionConnection): Promise<ImportResult> {
  if (conn.method === "demo" || !conn.accessToken) return { checked: 0, imported: 0, updated: 0, tasks: 0 };
  const startedAt = new Date();
  const token = decrypt(conn.accessToken);
  // Overlap a little so edits made during the previous sync aren't missed.
  const since = conn.lastSyncedAt ? new Date(conn.lastSyncedAt.getTime() - 10 * 60_000) : new Date(Date.now() - NOTION_LOOKBACK_DAYS * 86400_000);
  const result: ImportResult = { checked: 0, imported: 0, updated: 0, tasks: 0 };
  try {
    const pages = await recentPages(token, since);
    const parents = new Map<string, string | null>();
    for (const page of pages) {
      result.checked++;
      const r = await importPage(conn, token, page, parents);
      if (r === "skip") continue;
      if (r.created) result.imported++;
      else result.updated++;
      result.tasks += r.tasks;
    }
    await prisma.notionConnection.update({ where: { id: conn.id }, data: { lastSyncedAt: startedAt, status: "OK", lastError: null } });
    return result;
  } catch (e) {
    await prisma.notionConnection.update({ where: { id: conn.id }, data: { status: "ERROR", lastError: String((e as Error).message).slice(0, 300) } });
    throw e;
  }
}

export async function syncAllNotion() {
  const conns = await prisma.notionConnection.findMany({ where: { method: { not: "demo" } } });
  if (!conns.length) return { connections: 0, imported: 0, updated: 0, tasks: 0, errors: [] as string[] };
  const run = await prisma.syncRun.create({ data: { kind: "notion" } });
  const total = { imported: 0, updated: 0, tasks: 0 };
  const errors: string[] = [];
  for (const c of conns) {
    try {
      const r = await syncNotionConnection(c);
      total.imported += r.imported;
      total.updated += r.updated;
      total.tasks += r.tasks;
    } catch (e) {
      errors.push(`${c.workspaceName}: ${(e as Error).message}`);
    }
  }
  const msg = [`${total.imported} new`, `${total.updated} updated`, `${total.tasks} to-dos`].join(" · ");
  await prisma.syncRun.update({
    where: { id: run.id },
    data: { status: errors.length ? "ERROR" : "SUCCESS", finishedAt: new Date(), imported: total.imported, message: errors.length ? errors.join("; ") : msg },
  });
  return { connections: conns.length, ...total, errors };
}
