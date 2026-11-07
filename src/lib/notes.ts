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
