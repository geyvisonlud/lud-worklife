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
  notionApi,
  type NotionPage,
} from "./notion";
import { INBOX_TITLE, parseInboxRow, sameProjectName } from "./notion-inbox";

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
  // The Dashboard Inbox first, so its rows are known (and skipped) below.
  const inbox = await syncInbox(conn).catch(() => null);
  if (inbox) result.imported += inbox.imported;
  const fresh = await prisma.notionConnection.findUnique({ where: { id: conn.id }, select: { inboxDatabaseId: true } });
  conn = { ...conn, inboxDatabaseId: fresh?.inboxDatabaseId ?? null };
  try {
    const pages = await recentPages(token, since);
    const parents = new Map<string, string | null>();
    for (const page of pages) {
      // Rows of the Dashboard Inbox are imported by syncInbox, not as pages that involve me.
      if (conn.inboxDatabaseId && sameIdLoose(page.parent?.database_id, conn.inboxDatabaseId)) continue;
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

/* ------------------------------------------------------- Dashboard Inbox */

const sameIdLoose = (a: string | undefined | null, b: string | undefined | null) =>
  Boolean(a && b && a.replace(/-/g, "").toLowerCase() === b.replace(/-/g, "").toLowerCase());

type NotionDatabase = { id: string; title?: { plain_text: string }[]; archived?: boolean; in_trash?: boolean };

/** The "Dashboard Inbox" database shared with the integration (exact title, any case), or null. */
export async function findInboxDatabase(token: string) {
  const r = await notionApi<{ results: NotionDatabase[] }>(token, "/search", {
    method: "POST",
    body: { query: INBOX_TITLE, filter: { property: "object", value: "database" }, page_size: 20 },
  });
  const title = (d: NotionDatabase) => (d.title ?? []).map((t) => t.plain_text).join("").trim().toLowerCase();
  return r.results.find((d) => !d.archived && !d.in_trash && title(d) === INBOX_TITLE.toLowerCase())?.id ?? null;
}

export type InboxResult = { found: boolean; checked: number; imported: number };

/**
 * Imports new rows of the Dashboard Inbox as tasks or projects — each row once (tasks remember the row in
 * `notionInboxPageId`, projects in `notionPageId`). Later edits to an imported row are not pulled: the item lives here.
 * Only rows edited since the last run are looked at (with a little overlap).
 */
export async function syncInbox(conn: NotionConnection): Promise<InboxResult> {
  if (conn.method === "demo" || !conn.accessToken) return { found: false, checked: 0, imported: 0 };
  const token = decrypt(conn.accessToken);
  const startedAt = new Date();
  try {
    let dbId = conn.inboxDatabaseId;
    let since = conn.inboxSyncedAt ? new Date(conn.inboxSyncedAt.getTime() - 10 * 60_000) : null;
    const query = async (cursor?: string) =>
      notionApi<{ results: NotionPage[]; has_more: boolean; next_cursor: string | null }>(token, `/databases/${dbId}/query`, {
        method: "POST",
        body: {
          page_size: 100,
          sorts: [{ timestamp: "created_time", direction: "ascending" }],
          ...(since ? { filter: { timestamp: "last_edited_time", last_edited_time: { on_or_after: since.toISOString() } } } : {}),
          ...(cursor ? { start_cursor: cursor } : {}),
        },
      });
    let first: Awaited<ReturnType<typeof query>> | null = null;
    if (dbId) first = await query().catch(() => null); // gone or no longer shared → look for it again
    if (!first) {
      dbId = await findInboxDatabase(token);
      if (!dbId) {
        await prisma.notionConnection.update({
          where: { id: conn.id },
          data: { inboxDatabaseId: null, inboxSyncedAt: startedAt, inboxError: `No database named “${INBOX_TITLE}” is shared with the integration.` },
        });
        return { found: false, checked: 0, imported: 0 };
      }
      if (dbId !== conn.inboxDatabaseId) since = null; // a new inbox: read all of it
      first = await query();
    }

    const rows: NotionPage[] = [...first.results];
    let page = first;
    for (let i = 0; page.has_more && page.next_cursor && i < 9; i++) {
      page = await query(page.next_cursor);
      rows.push(...page.results);
    }

    let imported = 0;
    const projects = await prisma.project.findMany({ where: { archived: false }, select: { id: true, name: true } });
    for (const row of rows) {
      if (row.archived || row.in_trash) continue;
      const item = parseInboxRow(row);
      if (!item) continue;
      if (item.kind === "project") {
        if (await prisma.project.findUnique({ where: { notionPageId: row.id } })) continue;
        const top = await prisma.project.findFirst({ where: { stage: "planned" }, orderBy: { position: "asc" } });
        const p = await prisma.project
          .create({
            data: {
              name: item.title,
              description: item.notes,
              dueDate: item.dueDate,
              emoji: row.icon?.type === "emoji" ? (row.icon.emoji ?? null) : null,
              color: colorFor(item.title),
              stage: "planned",
              position: (top?.position ?? 1024) - 1024,
              source: "notion",
              notionPageId: row.id,
              notionUrl: row.url,
              notionParent: INBOX_TITLE,
              notionWorkspace: conn.workspaceName,
              notionReason: "inbox",
              notionEditedAt: new Date(row.last_edited_time),
              notionSyncedAt: new Date(),
              stageOverridden: true,
            },
          })
          .catch(() => null); // imported by a run at the same moment
        if (p) {
          projects.push({ id: p.id, name: p.name });
          imported++;
        }
        continue;
      }
      if (await prisma.task.findUnique({ where: { notionInboxPageId: row.id } })) continue;
      let projectId: string | null = null;
      if (item.project) {
        const match = projects.find((p) => sameProjectName(p.name, item.project!));
        if (match) projectId = match.id;
        else {
          const top = await prisma.project.findFirst({ where: { stage: "planned" }, orderBy: { position: "asc" } });
          const p = await prisma.project.create({ data: { name: item.project, color: colorFor(item.project), stage: "planned", position: (top?.position ?? 1024) - 1024 } });
          projects.push({ id: p.id, name: p.name });
          projectId = p.id;
        }
      }
      const top = await prisma.task.findFirst({ where: { status: "todo", projectId }, orderBy: { position: "asc" } });
      const t = await prisma.task
        .create({
          data: {
            title: item.title,
            notes: item.notes,
            dueDate: item.dueDate,
            priority: item.priority,
            projectId,
            status: "todo",
            position: (top?.position ?? 1024) - 1024,
            notionInboxPageId: row.id,
          },
        })
        .catch(() => null); // imported by a run at the same moment
      if (t) imported++;
    }
    await prisma.notionConnection.update({ where: { id: conn.id }, data: { inboxDatabaseId: dbId, inboxSyncedAt: startedAt, inboxError: null } });
    return { found: true, checked: rows.length, imported };
  } catch (e) {
    await prisma.notionConnection.update({ where: { id: conn.id }, data: { inboxError: String((e as Error).message).slice(0, 300) } }).catch(() => {});
    throw e;
  }
}

/** Every real connection's inbox, when last checked more than `staleMs` ago (0 = always). */
export async function syncAllInboxes(staleMs = 0) {
  const conns = await prisma.notionConnection.findMany({
    where: { method: { not: "demo" }, ...(staleMs ? { OR: [{ inboxSyncedAt: null }, { inboxSyncedAt: { lt: new Date(Date.now() - staleMs) } }] } : {}) },
  });
  let imported = 0;
  for (const c of conns) imported += (await syncInbox(c).catch(() => null))?.imported ?? 0;
  return { connections: conns.length, imported };
}
