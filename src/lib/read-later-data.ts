import { randomBytes, timingSafeEqual } from "node:crypto";
import type { ReadItem } from "@prisma/client";
import { prisma } from "./db";
import { SETTING_KEYS, getSetting, setSetting } from "./settings";
import { fallbackTitle, parseMeta, sourceOf, splitShared, type FoundLink } from "./read-later";

export type ReadItemDTO = {
  id: string;
  url: string | null;
  title: string;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
  source: string;
  via: string;
  status: string;
  savedAt: string;
};

export const readItemDTO = (r: ReadItem): ReadItemDTO => ({
  id: r.id,
  url: r.url,
  title: r.title,
  description: r.description,
  imageUrl: r.imageUrl,
  siteName: r.siteName,
  source: r.source,
  via: r.via,
  status: r.status,
  savedAt: r.savedAt.toISOString(),
});

/** Title, description and preview image of a page (best effort: 5 s, first 300 KB). */
export async function fetchMeta(url: string) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LudWorklife/1.0; +read-later)", Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
    const reader = res.body?.getReader();
    if (!reader) return null;
    let html = "";
    const dec = new TextDecoder();
    while (html.length < 300_000) {
      const { value, done } = await reader.read();
      if (done) break;
      html += dec.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break;
    }
    reader.cancel().catch(() => {});
    return parseMeta(html, res.url || url);
  } catch {
    return null;
  }
}

/**
 * Saves a link or a bit of text. A link already saved is brought back to the top as unread (with the new note).
 * Links get their title / description / image from the page.
 */
export async function saveToReadLater(input: { url?: string | null; text?: string | null; title?: string | null; via: "phone" | "app" }) {
  const { url, note, title } = splitShared(input);
  if (!url && !note) return null;
  if (!url) {
    // A bit of text: its first sentence is the title, the rest the description.
    const first = title ?? note!.split(/(?<=[.!?])\s/)[0].slice(0, 140);
    const rest = title ? note! : note!.slice(first.length).trim();
    return prisma.readItem.create({ data: { title: first, description: rest ? rest.slice(0, 4000) : null, source: "text", via: input.via } });
  }
  const meta = await fetchMeta(url);
  const data = {
    title: (title ?? meta?.title ?? fallbackTitle(url)).slice(0, 300),
    description: note ?? meta?.description ?? null,
    imageUrl: meta?.imageUrl ?? null,
    siteName: meta?.siteName ?? null,
    source: sourceOf(url),
  };
  return prisma.readItem.upsert({
    where: { url },
    create: { url, ...data, via: input.via },
    update: { ...data, status: "unread", readAt: null, savedAt: new Date() },
  });
}

/** Import links from an export; existing ones are left as they are. Returns how many were new. */
export async function importLinks(links: FoundLink[]) {
  const existing = new Set((await prisma.readItem.findMany({ where: { url: { in: links.map((l) => l.url) } }, select: { url: true } })).map((r) => r.url));
  const fresh = links.filter((l) => !existing.has(l.url));
  if (fresh.length)
    await prisma.readItem.createMany({
      data: fresh.map((l) => ({ url: l.url, title: (l.title ?? fallbackTitle(l.url)).slice(0, 300), source: sourceOf(l.url), via: "import", savedAt: l.savedAt ?? new Date() })),
      skipDuplicates: true,
    });
  return { added: fresh.length, skipped: links.length - fresh.length };
}

/* ------------------------------------------------------------ capture token */

export const captureToken = () => getSetting(SETTING_KEYS.captureToken);

export async function newCaptureToken() {
  const t = randomBytes(24).toString("base64url");
  await setSetting(SETTING_KEYS.captureToken, t);
  return t;
}

export async function checkCaptureToken(given: string | null) {
  const want = await captureToken();
  if (!want || !given) return false;
  const a = Buffer.from(want);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}
