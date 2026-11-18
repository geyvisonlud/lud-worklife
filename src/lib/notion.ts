/**
 * Notion: which pages involve me, and how a page becomes a project here.
 *
 * A page is imported when it (a) has me in a People property (Owner, Assignee, Team…) — "assigned" —
 * or (b) @mentions me anywhere in its title, properties or content — "mentioned". Its content is
 * kept as a small block list for reading here, and to-dos that @mention me become tasks.
 * Pure functions (tested in notion.test.ts) + a tiny fetch client; no SDK.
 */
import type { ProjectStage } from "./kanban";

export const NOTION_API = "https://api.notion.com/v1";
export const NOTION_VERSION = "2022-06-28";

/* ------------------------------------------------------------------ types */

export type RichText = {
  type: "text" | "mention" | "equation";
  plain_text: string;
  href?: string | null;
  annotations?: { bold?: boolean; italic?: boolean; strikethrough?: boolean; code?: boolean };
  mention?: { type: string; user?: { id: string; name?: string } };
};

export type NotionProperty = { id?: string; type: string; [k: string]: unknown };

export type NotionPage = {
  object: "page";
  id: string;
  url: string;
  archived?: boolean;
  in_trash?: boolean;
  last_edited_time: string;
  icon?: { type: string; emoji?: string } | null;
  parent?: { type: string; database_id?: string; page_id?: string; workspace?: boolean };
  properties: Record<string, NotionProperty>;
};

export type NotionBlock = {
  id: string;
  type: string;
  has_children?: boolean;
  children?: NotionBlock[];
  [k: string]: unknown;
};

/** Text segment kept for display: t = text, b/i/s/c = bold/italic/strike/code, h = link, m = mention kind, me = mentions me. */
export type Seg = { t: string; b?: 1; i?: 1; s?: 1; c?: 1; h?: string; m?: string; me?: 1 };
export type SimpleBlock = {
  id: string;
  type: "p" | "h1" | "h2" | "h3" | "ul" | "ol" | "todo" | "toggle" | "quote" | "callout" | "code" | "divider" | "child" | "media";
  text: Seg[];
  checked?: boolean;
  icon?: string;
  children?: SimpleBlock[];
};

/* ---------------------------------------------------------- detection */

export const mentionsUser = (rich: RichText[] | undefined, userId: string) =>
  Boolean(rich?.some((r) => r.type === "mention" && r.mention?.type === "user" && sameId(r.mention.user?.id, userId)));

/** Notion ids come with or without dashes. */
export const sameId = (a: string | undefined | null, b: string | undefined | null) =>
  Boolean(a && b && a.replace(/-/g, "").toLowerCase() === b.replace(/-/g, "").toLowerCase());

/** Name of the People property that includes me (null when none does). */
export function assignedVia(properties: Record<string, NotionProperty>, userId: string) {
  for (const [name, p] of Object.entries(properties)) {
    if (p.type === "people" && Array.isArray(p.people) && (p.people as { id: string }[]).some((u) => sameId(u.id, userId))) return name;
  }
  return null;
}

/** @mentions in the title or any text property. */
export function propertiesMention(properties: Record<string, NotionProperty>, userId: string) {
  return Object.values(properties).some((p) => (p.type === "title" || p.type === "rich_text") && mentionsUser(p[p.type] as RichText[], userId));
}

/** Rich text of a block of any text type. */
export const blockRich = (b: NotionBlock): RichText[] | undefined => (b[b.type] as { rich_text?: RichText[] } | undefined)?.rich_text;

export function blocksMention(blocks: NotionBlock[], userId: string): boolean {
  return blocks.some((b) => mentionsUser(blockRich(b), userId) || (b.children ? blocksMention(b.children, userId) : false));
}

/** To-dos that @mention me, anywhere in the page. */
export function todosForUser(blocks: NotionBlock[], userId: string): { blockId: string; title: string; checked: boolean }[] {
  const out: { blockId: string; title: string; checked: boolean }[] = [];
  const walk = (list: NotionBlock[]) => {
    for (const b of list) {
      if (b.type === "to_do") {
        const rich = blockRich(b) ?? [];
        if (mentionsUser(rich, userId)) {
          const title = rich
            .filter((r) => !(r.type === "mention" && r.mention?.type === "user" && sameId(r.mention.user?.id, userId)))
            .map((r) => r.plain_text)
            .join("")
            .replace(/\s+/g, " ")
            .replace(/^[\s,:–—-]+|[\s,:–—-]+$/g, "")
            .trim();
          out.push({ blockId: b.id, title: title || "To-do from Notion", checked: Boolean((b.to_do as { checked?: boolean })?.checked) });
        }
      }
      if (b.children) walk(b.children);
    }
  };
  walk(blocks);
  return out;
}

/* --------------------------------------------------------- page fields */

const plain = (rich: RichText[] | undefined) => (rich ?? []).map((r) => r.plain_text).join("").trim();

export function pageTitle(page: Pick<NotionPage, "properties">) {
  const t = Object.values(page.properties).find((p) => p.type === "title");
  return plain(t?.title as RichText[]) || "Untitled";
}

/** First status (or "Status"/"Stage" select) property value. */
export function pageStatus(page: Pick<NotionPage, "properties">) {
  const entries = Object.entries(page.properties);
  const status = entries.find(([, p]) => p.type === "status");
  if (status) return ((status[1].status as { name?: string } | null)?.name ?? null) || null;
  const select = entries.find(([n, p]) => p.type === "select" && /status|stage|state|fase|etapa|situa/i.test(n));
  return select ? ((select[1].select as { name?: string } | null)?.name ?? null) || null : null;
}

/** Due date (YYYY-MM-DD) from a date property named like a deadline, else the first date property. */
export function pageDue(page: Pick<NotionPage, "properties">) {
  const dates = Object.entries(page.properties).filter(([, p]) => p.type === "date" && (p.date as { start?: string } | null)?.start);
  const named = dates.find(([n]) => /due|deadline|end|target|prazo|entrega|data/i.test(n)) ?? dates[0];
  if (!named) return null;
  const d = named[1].date as { start: string; end?: string | null };
  return (d.end ?? d.start).slice(0, 10);
}

/** Notion status → Kanban stage. Works with English and Portuguese status names; null = no opinion. */
export function stageFromStatus(status: string | null | undefined): ProjectStage | null {
  if (!status) return null;
  const s = status
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  if (/\b(done|complete|completed|shipped|launched|closed|finished|resolved|concluid[oa]|finalizad[oa]|entregue|feito|pronto|encerrad[oa])\b/.test(s)) return "done";
  if (/\b(hold|paused|blocked|waiting|parked|pausad[oa]|bloquead[oa]|aguardando|espera|parad[oa]|cancel)/.test(s)) return "hold";
  if (/(progress|doing|active|ongoing|review|testing|qa|started|andamento|fazendo|execucao|desenvolvimento|revisao|validacao|ativo)/.test(s) && !/not started|nao iniciad/.test(s))
    return "active";
  return "planned";
}

/* ---------------------------------------------------- content snapshot */

const TYPE_MAP: Record<string, SimpleBlock["type"]> = {
  paragraph: "p",
  heading_1: "h1",
  heading_2: "h2",
  heading_3: "h3",
  bulleted_list_item: "ul",
  numbered_list_item: "ol",
  to_do: "todo",
  toggle: "toggle",
  quote: "quote",
  callout: "callout",
  code: "code",
};

export function toSegs(rich: RichText[] | undefined, userId: string): Seg[] {
  return (rich ?? []).map((r) => {
    const s: Seg = { t: r.plain_text };
    if (r.annotations?.bold) s.b = 1;
    if (r.annotations?.italic) s.i = 1;
    if (r.annotations?.strikethrough) s.s = 1;
    if (r.annotations?.code) s.c = 1;
    if (r.href) s.h = r.href;
    if (r.type === "mention" && r.mention) {
      s.m = r.mention.type;
      if (r.mention.type === "user" && sameId(r.mention.user?.id, userId)) s.me = 1;
    }
    return s;
  });
}

/** Notion blocks → SimpleBlock[] for reading here. Column layouts and synced blocks are flattened. */
export function simplifyBlocks(blocks: NotionBlock[], userId: string): SimpleBlock[] {
  const out: SimpleBlock[] = [];
  for (const b of blocks) {
    if (b.type === "column_list" || b.type === "column" || b.type === "synced_block") {
      if (b.children) out.push(...simplifyBlocks(b.children, userId));
      continue;
    }
    const kids = b.children?.length ? simplifyBlocks(b.children, userId) : undefined;
    const mapped = TYPE_MAP[b.type];
    if (mapped) {
      const data = b[b.type] as { checked?: boolean; icon?: { emoji?: string } };
      const sb: SimpleBlock = { id: b.id, type: mapped, text: toSegs(blockRich(b), userId) };
      if (mapped === "todo") sb.checked = Boolean(data?.checked);
      if (mapped === "callout" && data?.icon?.emoji) sb.icon = data.icon.emoji;
      if (kids) sb.children = kids;
      out.push(sb);
    } else if (b.type === "divider") out.push({ id: b.id, type: "divider", text: [] });
    else if (b.type === "child_page" || b.type === "child_database") {
      out.push({ id: b.id, type: "child", text: [{ t: (b[b.type] as { title?: string })?.title || "Untitled" }], icon: b.type === "child_page" ? "📄" : "🗂" });
    } else if (["image", "video", "file", "pdf", "embed", "bookmark", "link_preview"].includes(b.type)) {
      const data = b[b.type] as { caption?: RichText[]; url?: string };
      const caption = toSegs(data?.caption, userId);
      out.push({ id: b.id, type: "media", text: caption.length ? caption : [{ t: b.type[0].toUpperCase() + b.type.slice(1).replace("_", " "), ...(data?.url ? { h: data.url } : {}) }] });
    }
  }
  return out;
}

/** Short plain-text summary (first paragraphs) for the project description. */
export function summary(blocks: SimpleBlock[], max = 220) {
  const text = blocks
    .filter((b) => b.type === "p" || b.type === "callout" || b.type === "quote")
    .map((b) => b.text.map((s) => s.t).join(""))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text || null;
}

/* ------------------------------------------------------------------ OAuth */

export const notionOAuthConfigured = () => Boolean(process.env.NOTION_CLIENT_ID && process.env.NOTION_CLIENT_SECRET);
export const notionRedirectUri = (base: string) => `${base.replace(/\/+$/, "")}/api/notion/callback`;

export function notionAuthorizeUrl(opts: { clientId: string; redirectUri: string; state: string }) {
  const p = new URLSearchParams({ client_id: opts.clientId, redirect_uri: opts.redirectUri, response_type: "code", owner: "user", state: opts.state });
  return `${NOTION_API}/oauth/authorize?${p}`;
}

export type NotionTokenResponse = {
  access_token: string;
  bot_id: string;
  workspace_id: string;
  workspace_name?: string;
  workspace_icon?: string | null;
  owner?: { type: string; user?: { id: string; name?: string; person?: { email?: string } } };
};

export async function exchangeNotionCode(code: string, redirectUri: string) {
  const basic = Buffer.from(`${process.env.NOTION_CLIENT_ID}:${process.env.NOTION_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${NOTION_API}/oauth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json", "Notion-Version": NOTION_VERSION },
    body: JSON.stringify({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || json.error || "Notion token exchange failed");
  return json as NotionTokenResponse;
}

/* -------------------------------------------------------------------- HTTP */

export async function notionApi<T>(token: string, path: string, init: { method?: string; body?: unknown } = {}, attempt = 0): Promise<T> {
  const res = await fetch(`${NOTION_API}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION, ...(init.body ? { "Content-Type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  if (res.status === 429 && attempt < 4) {
    const wait = Number(res.headers.get("retry-after") ?? 1) * 1000;
    await new Promise((r) => setTimeout(r, Math.min(wait, 10_000)));
    return notionApi(token, path, init, attempt + 1);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || `Notion error ${res.status}`);
  return json as T;
}

/** Pages shared with the integration, most recently edited first, until `since` (or `max` pages). */
export async function recentPages(token: string, since: Date, max = 150) {
  const pages: NotionPage[] = [];
  let cursor: string | undefined;
  for (;;) {
    const r = await notionApi<{ results: NotionPage[]; has_more: boolean; next_cursor: string | null }>(token, "/search", {
      method: "POST",
      body: { filter: { property: "object", value: "page" }, sort: { direction: "descending", timestamp: "last_edited_time" }, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) },
    });
    for (const p of r.results) {
      if (new Date(p.last_edited_time) < since) return pages;
      if (!p.archived && !p.in_trash) pages.push(p);
      if (pages.length >= max) return pages;
    }
    if (!r.has_more || !r.next_cursor) return pages;
    cursor = r.next_cursor;
  }
}

/** Blocks with children filled in (to `depth` levels, at most `budget` blocks in total). */
export async function pageBlocks(token: string, blockId: string, depth = 3, budget = { left: 400 }): Promise<NotionBlock[]> {
  const out: NotionBlock[] = [];
  let cursor: string | undefined;
  do {
    const r = await notionApi<{ results: NotionBlock[]; has_more: boolean; next_cursor: string | null }>(
      token,
      `/blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`,
    );
    out.push(...r.results);
    budget.left -= r.results.length;
    cursor = r.has_more && r.next_cursor && budget.left > 0 ? r.next_cursor : undefined;
  } while (cursor);
  if (depth > 1) {
    for (const b of out) {
      // Sub-pages are their own pages (imported on their own if they mention me).
      if (b.has_children && budget.left > 0 && b.type !== "child_page" && b.type !== "child_database") {
        b.children = await pageBlocks(token, b.id, depth - 1, budget);
      }
    }
  }
  return out;
}

/** Title of a page's parent (database or page), for "in Product Roadmap". */
export async function parentTitle(token: string, parent: NotionPage["parent"]) {
  try {
    if (parent?.type === "database_id" && parent.database_id) {
      const db = await notionApi<{ title?: RichText[] }>(token, `/databases/${parent.database_id}`);
      return plain(db.title) || null;
    }
    if (parent?.type === "page_id" && parent.page_id) {
      return pageTitle(await notionApi<NotionPage>(token, `/pages/${parent.page_id}`));
    }
  } catch {
    /* the parent may not be shared with the integration */
  }
  return null;
}

/** For an internal integration: find "me" among the workspace's people by email. */
export async function findUserByEmail(token: string, email: string) {
  let cursor: string | undefined;
  do {
    const r = await notionApi<{ results: { id: string; type: string; name?: string; person?: { email?: string } }[]; has_more: boolean; next_cursor: string | null }>(
      token,
      `/users?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`,
    );
    const hit = r.results.find((u) => u.type === "person" && u.person?.email?.toLowerCase() === email.toLowerCase());
    if (hit) return { id: hit.id, name: hit.name ?? null, email };
    cursor = r.has_more && r.next_cursor ? r.next_cursor : undefined;
  } while (cursor);
  return null;
}
