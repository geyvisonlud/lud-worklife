/**
 * Notes: Markdown text with a folder and tags. Pure helpers (tested in notes.test.ts): tags,
 * a title when none was typed, a plain-text excerpt, search terms and the e-mail share link.
 */

/** "#Work, ideas  #work" → ["work", "ideas"] — lowercase, no "#", no spaces, unique, at most 20. */
export function normalizeTags(input: string | string[]) {
  const raw = Array.isArray(input) ? input : input.split(/[,\s]+/);
  const out: string[] = [];
  for (const t of raw) {
    const tag = t
      .trim()
      .replace(/^#+/, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_/-]+/gu, "")
      .slice(0, 40);
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out.slice(0, 20);
}

/** Markdown → readable plain text (for excerpts, search snippets and e-mail). */
export function plainText(md: string) {
  return md
    .replace(/```[\s\S]*?```/g, (b) => b.replace(/```\w*\n?/g, ""))
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*\n?/gm, "")
    .replace(/^[ \t]*\|(.*)\|[ \t]*$/gm, (_, row: string) => row.split("|").map((c) => c.trim()).join(" · "))
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+\[( |x|X)\]\s+/gm, (m) => (/\[(x|X)\]/.test(m) ? "☑ " : "☐ "))
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/^\s*>\s?/gm, "")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(\*|_)(.+?)\1/g, "$2")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*([-*_]\s*){3,}$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The note's title, or its first line when it has none. */
export function noteTitle(n: { title: string; body: string }) {
  if (n.title.trim()) return n.title.trim();
  const first = plainText(n.body).split("\n").find((l) => l.trim());
  return first ? first.replace(/^[•☐☑]\s*/, "").slice(0, 80) : "Untitled note";
}

/** A short plain-text preview of the body (without the line used as title). */
export function excerpt(n: { title: string; body: string }, max = 140) {
  let text = plainText(n.body);
  if (!n.title.trim()) text = text.split("\n").slice(1).join("\n");
  text = text.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/**
 * Search box text → words to match (all must appear in title, body or tags) and "#tag" filters.
 * `"#work budget"` → { words: ["budget"], tags: ["work"] }.
 */
export function parseQuery(q: string) {
  const words: string[] = [];
  const tags: string[] = [];
  for (const part of q.trim().split(/\s+/).filter(Boolean)) {
    if (part.startsWith("#") && part.length > 1) tags.push(...normalizeTags(part));
    else words.push(part.slice(0, 60));
  }
  return { words: words.slice(0, 8), tags };
}

/** `mailto:` link that opens a new e-mail with the note (plain text — Mail apps don't render Markdown). */
export function mailtoHref(n: { title: string; body: string; tags?: string[] }, to = "") {
  const title = noteTitle(n);
  let body = plainText(n.body);
  if (n.tags?.length) body += `\n\n${n.tags.map((t) => `#${t}`).join(" ")}`;
  // Some mail apps drop very long mailto links; the full note can still be copied.
  if (body.length > 6000) body = `${body.slice(0, 6000)}…`;
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

/** "HH:MM" → minutes after midnight, or null. */
export function parseHm(t: string | null | undefined) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/**
 * The calendar event made from a note: a timed event (`time` given) or an all-day one.
 * Returns the stored instants (all-day = UTC midnight, like synced events) and the Google API body.
 */
export function noteEvent(
  n: { id: string; title: string; body: string },
  when: { date: string; time: string | null; durationMin: number; tz: string },
  toUtc: (ymd: string, minutes: number, tz: string) => Date,
  appUrl?: string,
) {
  const title = noteTitle(n);
  const link = appUrl ? `\n\n${appUrl.replace(/\/+$/, "")}/notes?n=${n.id}` : "";
  const description = `${plainText(n.body)}${link}`.trim().slice(0, 8000) || undefined;
  const minutes = parseHm(when.time);
  if (minutes === null) {
    const start = new Date(`${when.date}T00:00:00.000Z`);
    const next = new Date(start.getTime() + 86400_000).toISOString().slice(0, 10);
    return { title, description, allDay: true, start, end: start, google: { summary: title, description, start: { date: when.date }, end: { date: next } } };
  }
  const start = toUtc(when.date, minutes, when.tz);
  const end = new Date(start.getTime() + Math.max(5, Math.min(24 * 60, when.durationMin)) * 60_000);
  return {
    title,
    description,
    allDay: false,
    start,
    end,
    google: { summary: title, description, start: { dateTime: start.toISOString(), timeZone: when.tz }, end: { dateTime: end.toISOString(), timeZone: when.tz } },
  };
}

/**
 * Enter inside a Markdown list: continue it on the next line ("- ", "- [ ] ", "3. " → "4. "). Enter on an
 * empty item ends the list (the marker is removed). Returns the new text and cursor, or null to let Enter be.
 */
export function continueList(text: string, selStart: number, selEnd: number) {
  if (selStart !== selEnd) return null;
  const lineStart = text.lastIndexOf("\n", selStart - 1) + 1;
  const line = text.slice(lineStart, selStart);
  const m = /^(\s*)([-*+]|(\d+)[.)])\s(\[[ xX]\]\s)?/.exec(line);
  if (!m) return null;
  const [marker, indent, bullet, num, box] = m;
  if (line.trim() === marker.trim()) {
    // empty item → end the list
    const next = text.slice(0, lineStart) + text.slice(selStart);
    return { text: next, cursor: lineStart };
  }
  const nextBullet = num ? `${Number(num) + 1}${bullet.slice(-1)}` : bullet;
  const insert = `\n${indent}${nextBullet} ${box ? "[ ] " : ""}`;
  return { text: text.slice(0, selStart) + insert + text.slice(selEnd), cursor: selStart + insert.length };
}

/* ------------------------------------------------------------ folder tree */

export type FolderNode = { id: string; name: string; parentId: string | null; position: number };
export type FolderTreeItem<F extends FolderNode = FolderNode> = F & { depth: number; path: string };

/**
 * Folders in tree order (depth first, siblings by position then name), with their depth and
 * "Parent / Child" path. A folder whose parent is missing (or a cycle) is shown at the top level.
 */
export function folderTree<F extends FolderNode>(folders: F[]): FolderTreeItem<F>[] {
  const ids = new Set(folders.map((f) => f.id));
  const kids = new Map<string | null, F[]>();
  for (const f of folders) {
    const p = f.parentId && ids.has(f.parentId) && f.parentId !== f.id ? f.parentId : null;
    kids.set(p, [...(kids.get(p) ?? []), f]);
  }
  const sort = (a: F, b: F) => a.position - b.position || a.name.localeCompare(b.name);
  const out: FolderTreeItem<F>[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number, prefix: string) => {
    for (const f of [...(kids.get(parent) ?? [])].sort(sort)) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      const path = prefix ? `${prefix} / ${f.name}` : f.name;
      out.push({ ...f, depth, path });
      walk(f.id, depth + 1, path);
    }
  };
  walk(null, 0, "");
  // Cycles never reach the root: put them at the top level.
  for (const f of folders.filter((f) => !seen.has(f.id)).sort(sort)) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    out.push({ ...f, depth: 0, path: f.name });
    walk(f.id, 1, f.name);
  }
  return out;
}

/** The folder and everything inside it (ids). */
export function folderAndDescendants(folders: Pick<FolderNode, "id" | "parentId">[], id: string) {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) if (f.parentId && out.has(f.parentId) && !out.has(f.id)) (out.add(f.id), (grew = true));
  }
  return [...out];
}

/** A folder can't go inside itself or one of its own subfolders. */
export function canMoveFolder(folders: Pick<FolderNode, "id" | "parentId">[], id: string, parentId: string | null) {
  if (parentId === null) return true;
  if (!folders.some((f) => f.id === parentId)) return false;
  return !folderAndDescendants(folders, id).includes(parentId);
}
