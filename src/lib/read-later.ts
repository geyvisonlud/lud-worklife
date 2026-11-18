/**
 * Read Later: links and bits of text saved to read later (phone share sheet, paste, imports).
 * Pure helpers, tested in read-later.test.ts: tidy a link, tell where it's from, read a page's
 * title/description/image, split shared text into link + note, and pull links out of export files.
 */

const TRACKING = /^(utm_\w+|fbclid|gclid|igshid|igsh|si|ref_src|ref_url|s|t|mc_cid|mc_eid)$/i;

/** Canonical form for de-duplication: https, no tracking params, no fragment, no trailing slash; twitter.com → x.com. */
export function normalizeUrl(input: string): string | null {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  u.hash = "";
  u.hostname = u.hostname.toLowerCase().replace(/^(www\.|mobile\.|m\.)(?=(twitter|x|instagram|youtube)\.com$)/, "");
  if (u.hostname === "twitter.com") u.hostname = "x.com";
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  if (u.hostname === "x.com" || u.hostname === "instagram.com") u.search = "";
  let s = u.toString();
  if (u.pathname !== "/" && s.endsWith("/") && !u.search) s = s.slice(0, -1);
  return s;
}

export type ReadSource = "web" | "instagram" | "x" | "youtube" | "text";

export function sourceOf(url: string | null): ReadSource {
  if (!url) return "text";
  const host = new URL(url).hostname.replace(/^www\./, "");
  if (host === "instagram.com" || host.endsWith(".instagram.com")) return "instagram";
  if (host === "x.com" || host === "twitter.com") return "x";
  if (host === "youtube.com" || host === "youtu.be" || host.endsWith(".youtube.com")) return "youtube";
  return "web";
}

export const SOURCE_LABEL: Record<ReadSource, string> = { web: "Web", instagram: "Instagram", x: "X", youtube: "YouTube", text: "Text" };

/** "nytimes.com" from a link. */
export const hostOf = (url: string) => new URL(url).hostname.replace(/^www\./, "");

/** A readable fallback title for a link we couldn't fetch: "x.com/naval/status/…" → "Post by @naval on X". */
export function fallbackTitle(url: string) {
  const u = new URL(url);
  const parts = u.pathname.split("/").filter(Boolean);
  const src = sourceOf(url);
  if (src === "x" && parts[0]) return `Post by @${parts[0]} on X`;
  if (src === "instagram") return parts[0] === "reel" ? "Instagram reel" : parts[0] === "p" ? "Instagram post" : `@${parts[0] ?? "instagram"} on Instagram`;
  const last = decodeURIComponent(parts[parts.length - 1] ?? "")
    .replace(/\.(html?|php|aspx?)$/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
  return last && last.length > 3 ? `${last.charAt(0).toUpperCase()}${last.slice(1)}` : hostOf(url);
}

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

/** Title / description / image / site from a page's HTML (Open Graph, Twitter cards, <title>). */
export function parseMeta(html: string, baseUrl: string) {
  const head = html.slice(0, 200_000);
  const meta = (name: string) => {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, "i");
    const tag = re.exec(head)?.[0];
    const content = tag && /content=["']([^"']*)["']/i.exec(tag)?.[1];
    return content ? decodeEntities(content).trim() : null;
  };
  const title = meta("og:title") ?? meta("twitter:title") ?? (/<title[^>]*>([^<]*)<\/title>/i.exec(head)?.[1] ? decodeEntities(/<title[^>]*>([^<]*)<\/title>/i.exec(head)![1]).trim() : null);
  let image = meta("og:image") ?? meta("twitter:image");
  if (image) {
    try {
      image = new URL(image, baseUrl).toString();
    } catch {
      image = null;
    }
  }
  return {
    title: title?.slice(0, 300) || null,
    description: (meta("og:description") ?? meta("description") ?? meta("twitter:description"))?.slice(0, 600) || null,
    imageUrl: image?.startsWith("https://") ? image : null,
    siteName: meta("og:site_name")?.slice(0, 80) || null,
  };
}

const URL_RE = /https?:\/\/[^\s<>"'`]+[^\s<>"'`.,;:!?)\]]/;

/** What the share sheet sends ("Great read https://…", or just a link, or just text) → link + note. */
export function splitShared(input: { url?: string | null; text?: string | null; title?: string | null }) {
  const text = (input.text ?? "").trim();
  const found = input.url?.trim() || URL_RE.exec(text)?.[0] || null;
  const url = found ? normalizeUrl(found) : null;
  const note = (found ? text.replace(found, "") : text).trim().replace(/\s+/g, " ");
  return { url, note: note || null, title: input.title?.trim() || null };
}

export type FoundLink = { url: string; title: string | null; savedAt: Date | null };

/**
 * Links in an export file, whatever its shape: Instagram's saved_posts.json, Chrome's reading list / bookmarks
 * (Takeout JSON or bookmarks .html), or any JSON / HTML / text with links. Titles and dates are kept when present.
 */
export function extractLinks(content: string): FoundLink[] {
  const out = new Map<string, FoundLink>();
  const add = (raw: unknown, title?: unknown, when?: unknown) => {
    if (typeof raw !== "string") return;
    const url = normalizeUrl(raw);
    if (!url || out.has(url)) return;
    out.set(url, { url, title: typeof title === "string" && title.trim() ? title.trim().slice(0, 300) : null, savedAt: toDate(when) });
  };
  const trimmed = content.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      walk(JSON.parse(trimmed), add);
      return [...out.values()];
    } catch {
      /* not JSON after all */
    }
  }
  if (/<a\s/i.test(content)) {
    for (const m of content.matchAll(/<a\s([^>]*)>([\s\S]*?)<\/a>/gi)) {
      const href = /href=["']([^"']+)["']/i.exec(m[1])?.[1];
      const added = /add_date=["'](\d+)["']/i.exec(m[1])?.[1];
      if (href) add(decodeEntities(href), decodeEntities(m[2].replace(/<[^>]+>/g, "")), added ? Number(added) : undefined);
    }
    if (out.size) return [...out.values()];
  }
  for (const m of content.matchAll(new RegExp(URL_RE.source, "g"))) add(m[0]);
  return [...out.values()];
}

type Add = (url: unknown, title?: unknown, when?: unknown) => void;
function walk(v: unknown, add: Add, ctx: { title?: unknown } = {}) {
  if (Array.isArray(v)) {
    for (const x of v) walk(x, add, ctx);
    return;
  }
  if (!v || typeof v !== "object") return;
  const o = v as Record<string, unknown>;
  // Instagram: { title: "author", string_map_data: { "Saved on": { href, timestamp } } }
  if (o.string_map_data && typeof o.string_map_data === "object") {
    for (const entry of Object.values(o.string_map_data as Record<string, Record<string, unknown>>)) {
      if (entry && typeof entry === "object" && entry.href) add(entry.href, o.title ? `Saved from @${o.title}` : null, entry.timestamp);
    }
  }
  const url = o.url ?? o.href ?? o.link ?? o.uri;
  if (typeof url === "string" && /^https?:/i.test(url)) {
    add(url, o.title ?? o.name ?? o.text ?? ctx.title, o.creation_time_usec ?? o.creationTime ?? o.date_added ?? o.timestamp ?? o.saved_at ?? o.created_at ?? o.time);
  }
  for (const [k, x] of Object.entries(o)) if (x && typeof x === "object" && k !== "string_map_data") walk(x, add, { title: o.title ?? ctx.title });
}

/** Seconds, milliseconds, microseconds, Chrome's "WebKit" µs since 1601, or an ISO string → Date. */
export function toDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (typeof v === "string" && !/^\d+$/.test(v)) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  let ms: number;
  if (n > 1e16) ms = n / 1000 - 11644473600000; // WebKit µs since 1601
  else if (n > 1e14) ms = n / 1000; // µs
  else if (n > 1e11) ms = n; // ms
  else ms = n * 1000; // s
  const d = new Date(ms);
  return d.getFullYear() > 1995 && d.getFullYear() < 2100 ? d : null;
}
