/**
 * Possible tasks from email — the pure part (tested in email.test.ts).
 *
 * 1. `parseGmailMessage` turns Gmail's JSON into headers + plain text.
 * 2. `screen` drops what can't need you: marketing/newsletters (Promotions/Social/Forums tabs,
 *    List-Unsubscribe, bulk precedence, ESP headers), automated senders (no-reply…), and your own mail.
 * 3. What's left goes to Claude (lib/email-ai.ts) — or, without ANTHROPIC_API_KEY, to `ruleSuggestion`,
 *    a conservative keyword check in English and Portuguese.
 */
import { addDays, weekday } from "./dates";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const hasGmailScope = (scopes: string | null | undefined) => Boolean(scopes?.split(/\s+/).includes(GMAIL_SCOPE));

/* ------------------------------------------------------------------ parse */

type Part = { mimeType?: string; filename?: string; body?: { data?: string; size?: number }; parts?: Part[]; headers?: { name: string; value: string }[] };
export type GmailMessage = { id: string; threadId: string; labelIds?: string[]; snippet?: string; internalDate?: string; payload?: Part };

export type ParsedEmail = {
  messageId: string;
  threadId: string;
  labels: string[];
  headers: Record<string, string>;
  fromName: string | null;
  fromEmail: string;
  to: string;
  cc: string;
  subject: string;
  snippet: string;
  receivedAt: Date;
  text: string;
};

const b64url = (data: string) => Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
export function htmlToText(html: string) {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#?\w+);/g, (m, e) => ENTITIES[e] ?? (e.startsWith("#") ? String.fromCharCode(Number(e.slice(1))) : m))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

/** Drops quoted replies ("On … wrote:", "> …", "Em … escreveu:") and signatures so only the new message is read. */
export function stripQuoted(text: string) {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (/^(On|Em|El) .{4,200}(wrote|escreveu|escribió):\s*$/i.test(line.trim())) break;
    if (/^-{2,}\s*Original Message|^-{2,}\s*Mensagem original|^From: .+@/i.test(line.trim())) break;
    if (/^--\s*$/.test(line)) break;
    if (line.startsWith(">")) continue;
    out.push(line);
  }
  return out.join("\n").trim();
}

function findText(p: Part | undefined): { plain?: string; html?: string } {
  if (!p) return {};
  if (p.mimeType === "text/plain" && p.body?.data && !p.filename) return { plain: b64url(p.body.data) };
  if (p.mimeType === "text/html" && p.body?.data && !p.filename) return { html: b64url(p.body.data) };
  const acc: { plain?: string; html?: string } = {};
  for (const c of p.parts ?? []) {
    const r = findText(c);
    acc.plain ??= r.plain;
    acc.html ??= r.html;
  }
  return acc;
}

export function parseAddress(raw: string) {
  const m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || null, email: m[2].trim().toLowerCase() };
  return { name: null, email: raw.trim().toLowerCase() };
}

export function parseGmailMessage(m: GmailMessage, maxChars = 4000): ParsedEmail {
  const headers: Record<string, string> = {};
  for (const h of m.payload?.headers ?? []) headers[h.name.toLowerCase()] = h.value;
  const { plain, html } = findText(m.payload);
  const body = plain ?? (html ? htmlToText(html) : m.snippet ?? "");
  const from = parseAddress(headers.from ?? "");
  return {
    messageId: m.id,
    threadId: m.threadId,
    labels: m.labelIds ?? [],
    headers,
    fromName: from.name,
    fromEmail: from.email,
    to: headers.to ?? "",
    cc: headers.cc ?? "",
    subject: (headers.subject ?? "").trim() || "(no subject)",
    snippet: (m.snippet ?? "").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&"),
    receivedAt: new Date(Number(m.internalDate ?? Date.now())),
    text: stripQuoted(body).slice(0, maxChars),
  };
}

/* ----------------------------------------------------------------- screen */

const NOISE_TABS = ["CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL", "CATEGORY_FORUMS"];
const AUTOMATED_SENDER = /(^|[._+-])(no-?reply|do-?not-?reply|donotreply|noreply|newsletter|news|marketing|promo(tions)?|offers|deals|mailer|mailer-daemon|bounce|notifications?|alerts?|updates|digest|info|hello|team|support-noreply)([._+-]|@)/i;
const ESP_HEADERS = ["x-mailchimp-id", "x-campaign", "x-campaignid", "x-mc-user", "x-sg-eid", "x-mailgun-tag", "x-sfmc-stack", "x-marketoid", "x-hs-cid", "feedback-id"];

export type Screen = { keep: true } | { keep: false; why: string };

/**
 * Should this email be analyzed at all? Errs on the side of dropping bulk mail:
 * a missed newsletter costs nothing, a newsletter turned into a "task" is noise.
 */
export function screen(e: ParsedEmail, myEmails: string[]): Screen {
  const mine = myEmails.map((x) => x.toLowerCase());
  if (mine.includes(e.fromEmail)) return { keep: false, why: "sent by you" };
  if (e.labels.includes("SENT") || e.labels.includes("SPAM") || e.labels.includes("TRASH") || e.labels.includes("DRAFT")) return { keep: false, why: "not inbox" };
  const tab = NOISE_TABS.find((t) => e.labels.includes(t));
  if (tab) return { keep: false, why: `Gmail ${tab.replace("CATEGORY_", "").toLowerCase()} tab` };
  const h = e.headers;
  if (h["list-unsubscribe"] || h["list-id"]) return { keep: false, why: "mailing list / newsletter" };
  if (/bulk|list|junk/i.test(h.precedence ?? "")) return { keep: false, why: "bulk mail" };
  if (/auto-(generated|replied)/i.test(h["auto-submitted"] ?? "") || h["x-autoreply"] || h["x-autorespond"]) return { keep: false, why: "automatic reply" };
  if (ESP_HEADERS.some((k) => h[k] && (k !== "feedback-id" || /campaign|newsletter|marketing|promo/i.test(h[k])))) return { keep: false, why: "marketing platform" };
  if (AUTOMATED_SENDER.test(e.fromEmail.split("@")[0] + "@")) return { keep: false, why: "automated sender" };
  if (/unsubscribe|descadastr|cancelar inscri|view (this|in) (email|browser)|ver no navegador/i.test(e.text.slice(-1500))) return { keep: false, why: "has an unsubscribe footer" };
  return { keep: true };
}

/** Am I a direct recipient (To) rather than CC'd? Used to lower priority of CC'd mail. */
export const addressedToMe = (e: ParsedEmail, myEmails: string[]) => myEmails.some((m) => e.to.toLowerCase().includes(m.toLowerCase()));

/* ---------------------------------------------------- rules (no API key) */

const ASKS = [
  /\b(can|could|would) you\b/i,
  /\bplease\b/i,
  /\b(let me know|get back to me|your (thoughts|feedback|approval|input)|need you to|are you able)\b/i,
  /\b(review|approve|sign|confirm|send|reply|respond|fill out|complete|submit|schedule|book|pay|rsvp)\b.{0,60}\b(by|before|until|today|tomorrow|this week|asap)\b/i,
  /\b(pode|poderia|consegue|conseguiria)s?\b.{0,80}\?/i,
  /\b(por favor|preciso que|precisamos que|me (avisa|avise|manda|mande|envia|envie)|aguardo (seu|sua|retorno)|favor (enviar|revisar|aprovar|assinar|confirmar))\b/i,
  /\b(prazo|ate (amanha|hoje|sexta|segunda|o dia))\b/i,
];

/** Lowercase without accents, so \b works on Portuguese ("amanhã" → "amanha"). */
export const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/** Conservative fallback when Claude isn't configured: only clear requests become suggestions. */
export function ruleSuggestion(e: ParsedEmail, today: string) {
  const text = fold(`${e.subject}\n${e.text}`);
  const hits = ASKS.filter((r) => r.test(text)).length;
  const question = /\?\s*$/m.test(e.text.split("\n").slice(0, 25).join("\n"));
  if (hits === 0 && !question) return null;
  if (hits === 0 && question && e.text.length > 2500) return null; // long mail with a question somewhere — too unsure
  const raw = `${e.subject}\n${e.text}`;
  const subject = e.subject.replace(/^((re|fw|fwd|enc|res)\s*:\s*)+/i, "").trim();
  const who = e.fromName?.split(/\s+/)[0] ?? e.fromEmail.split("@")[0];
  return {
    title: `Reply to ${who}: ${subject}`.slice(0, 160),
    reason: hits ? "Asks you to do something" : "Asks you a question",
    dueDate: dueFromText(raw, today),
    priority: /\b(urgent|asap|urgente|hoje|today)\b/i.test(text) ? 3 : hits >= 2 ? 2 : 1,
  };
}

const WEEKDAYS: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };

/** "by Friday" / "até sexta" / "tomorrow" / "amanhã" / "today" / "hoje" / "EOD" → a date. */
export function dueFromText(text: string, today: string) {
  const t = fold(text);
  if (/\b(today|hoje|eod|end of (the )?day|fim do dia)\b/.test(t)) return today;
  if (/\b(tomorrow|amanha)\b/.test(t)) return addDays(today, 1);
  const m = t.match(/\b(by|before|until|on|ate|na|no)\s+(?:the\s+|a\s+|o\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|domingo|segunda|terca|quarta|quinta|sexta|sabado)\b/);
  if (m) {
    const target = WEEKDAYS[m[2]];
    const diff = (target - weekday(today) + 7) % 7 || 7;
    return addDays(today, diff);
  }
  if (/\b(this week|esta semana|essa semana)\b/.test(t)) return addDays(today, (5 - weekday(today) + 7) % 7);
  return null;
}

/* ------------------------------------------------------------------ links */

/** Opens the thread in Gmail, in the right account. */
export const gmailLink = (accountEmail: string, threadId: string) => `https://mail.google.com/mail/u/${encodeURIComponent(accountEmail)}/#all/${threadId}`;

/** Gmail search for the inbox scan: recent, inbox only, not in the bulk tabs. */
export const gmailQuery = (days: number) => `in:inbox newer_than:${days}d -category:promotions -category:social -category:forums`;

/** Days to look back: 3 on the first scan, otherwise since the last scan (+1 day overlap), at most 7. */
export function lookbackDays(last: Date | null, now = new Date()) {
  if (!last) return 3;
  return Math.min(7, Math.max(1, Math.ceil((now.getTime() - last.getTime()) / 86400_000) + 1));
}

/** Notes for the task created from an email: who, what, and a link back to the thread. */
export function taskNotesFromEmail(e: { fromName: string | null; fromEmail: string; subject: string; snippet: string | null }, link: string) {
  return [`From ${e.fromName ? `${e.fromName} <${e.fromEmail}>` : e.fromEmail}: “${e.subject}”`, e.snippet ? `> ${e.snippet}` : "", `Open in Gmail: ${link}`].filter(Boolean).join("\n\n");
}
