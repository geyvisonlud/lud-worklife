/**
 * Reader view ("Print View") for Read Later: the article's text and images only, from a page's HTML.
 * Readability finds the article; `sanitizeArticle` rebuilds it with a short allow-list of tags (no scripts,
 * styles, iframes, forms or event handlers; links/images must be http(s)), so it's safe to show as HTML.
 * Pure (no network); tested in reader.test.ts.
 */
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";

const KEEP = new Set(["p", "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "pre", "code", "strong", "em", "br", "hr", "figure", "figcaption", "img", "a", "table", "thead", "tbody", "tr", "th", "td", "sup", "sub"]);
const RENAME: Record<string, string> = { b: "strong", i: "em", h1: "h2", h5: "h4", h6: "h4" };
const DROP = new Set(["script", "style", "noscript", "iframe", "object", "embed", "form", "input", "button", "select", "textarea", "svg", "canvas", "video", "audio", "template", "nav", "footer", "aside"]);
const VOID = new Set(["br", "hr", "img"]);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function safeUrl(raw: string | null, base: string) {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim(), base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Article HTML → the same content with only safe tags and attributes. */
export function sanitizeArticle(html: string, baseUrl: string) {
  const { document } = parseHTML(`<!doctype html><html><body><div id="root">${html}</div></body></html>`);
  const root = document.getElementById("root");
  if (!root) return "";
  const out: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      out.push(esc(node.textContent ?? ""));
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    let tag = el.tagName.toLowerCase();
    if (DROP.has(tag)) return;
    tag = RENAME[tag] ?? tag;
    if (tag === "img") {
      const src = safeUrl(el.getAttribute("src") ?? el.getAttribute("data-src") ?? (el.getAttribute("srcset") ?? "").split(/[\s,]+/)[0], baseUrl);
      if (src) out.push(`<img src="${esc(src)}" alt="${esc(el.getAttribute("alt") ?? "")}" loading="lazy" referrerpolicy="no-referrer">`);
      return;
    }
    if (!KEEP.has(tag)) {
      el.childNodes.forEach(walk);
      return;
    }
    if (tag === "a") {
      const href = safeUrl(el.getAttribute("href"), baseUrl);
      if (!href) {
        el.childNodes.forEach(walk);
        return;
      }
      out.push(`<a href="${esc(href)}" target="_blank" rel="noopener noreferrer nofollow">`);
    } else out.push(`<${tag}>`);
    if (!VOID.has(tag)) {
      el.childNodes.forEach(walk);
      out.push(`</${tag}>`);
    }
  };
  root.childNodes.forEach(walk);
  return out
    .join("")
    .replace(/<p>\s*<\/p>/g, "")
    .trim();
}

/** The article in a page: title, author, site, safe HTML and reading time; null when the page has no readable article. */
export function extractArticle(html: string, url: string) {
  const { document } = parseHTML(html);
  // Readability needs the base URL to resolve relative links and images.
  try {
    const base = document.createElement("base");
    base.setAttribute("href", url);
    document.head?.prepend(base);
  } catch {
    /* no <head> */
  }
  let parsed: ReturnType<Readability["parse"]> = null;
  try {
    parsed = new Readability(document as unknown as Document, { charThreshold: 300 }).parse();
  } catch {
    parsed = null;
  }
  if (!parsed?.content) return null;
  const content = sanitizeArticle(parsed.content, url);
  const text = parsed.textContent ?? "";
  if (text.trim().length < 200) return null;
  return {
    title: parsed.title?.trim() || null,
    byline: parsed.byline?.trim()?.slice(0, 200) || null,
    siteName: parsed.siteName?.trim() || null,
    content,
    readMinutes: readingMinutes(text),
  };
}

/** ~220 words a minute, at least 1. */
export const readingMinutes = (text: string) => Math.max(1, Math.round(text.trim().split(/\s+/).filter(Boolean).length / 220));

/** Reader HTML → Markdown (for "Save to notes"). */
export function articleToMarkdown(html: string) {
  const td = new TurndownService({ headingStyle: "atx", bulletListMarker: "-", codeBlockStyle: "fenced", emDelimiter: "_" });
  return td
    .turndown(html)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
