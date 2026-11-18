import type { CalendarAccount } from "@prisma/client";
import { prisma } from "./db";
import { appTimeZone, ymdInTz } from "./dates";
import { GoogleAuthError, googleConfigured } from "./google";
import { accessToken } from "./google-sync";
import { lookbackDays, gmailQuery, hasGmailScope, parseGmailMessage, ruleSuggestion, screen, addressedToMe, type GmailMessage, type ParsedEmail } from "./email";
import { aiConfigured, classifyEmails } from "./email-ai";

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
/** At most this many new emails are read per account per scan. */
const MAX_PER_SCAN = 40;
const BATCH = 12;

async function gmail<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${GMAIL}${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) throw new GoogleAuthError("Google rejected the access token.");
  if (res.status === 403) throw new Error(json?.error?.message || "Gmail access isn't allowed for this account — reconnect it and allow Gmail.");
  if (!res.ok) throw new Error(json?.error?.message || `Gmail error ${res.status}`);
  return json as T;
}

export const canReadEmail = (a: Pick<CalendarAccount, "provider" | "scopes" | "emailEnabled">) => a.provider === "google" && a.emailEnabled && hasGmailScope(a.scopes);

/** Reads new inbox mail of one account and stores what needs you as pending suggestions. */
export async function scanAccount(accountId: string) {
  const account = await prisma.calendarAccount.findUniqueOrThrow({ where: { id: accountId } });
  if (!canReadEmail(account)) return { read: 0, suggested: 0 };
  const startedAt = new Date();
  const token = await accessToken(account);
  const list = await gmail<{ messages?: { id: string; threadId: string }[] }>(
    token,
    `/messages?${new URLSearchParams({ q: gmailQuery(lookbackDays(account.lastEmailScanAt)), maxResults: String(MAX_PER_SCAN) })}`,
  );
  const ids = (list.messages ?? []).map((m) => m.id);
  const seen = new Set((await prisma.emailSuggestion.findMany({ where: { accountId, messageId: { in: ids } }, select: { messageId: true } })).map((r) => r.messageId));
  const fresh = ids.filter((id) => !seen.has(id));

  const myEmails = (await prisma.calendarAccount.findMany({ select: { email: true } })).map((a) => a.email);
  const today = ymdInTz(new Date(), appTimeZone());
  const parsed: ParsedEmail[] = [];
  for (const id of fresh) parsed.push(parseGmailMessage(await gmail<GmailMessage>(token, `/messages/${id}?format=full`)));

  const base = (e: ParsedEmail) => ({
    accountId,
    messageId: e.messageId,
    threadId: e.threadId,
    fromName: e.fromName,
    fromEmail: e.fromEmail,
    subject: e.subject.slice(0, 300),
    snippet: e.snippet.slice(0, 300),
    receivedAt: e.receivedAt,
  });
  const rows: Parameters<typeof prisma.emailSuggestion.create>[0]["data"][] = [];
  const candidates: ParsedEmail[] = [];
  for (const e of parsed) {
    const s = screen(e, myEmails);
    if (!s.keep) rows.push({ ...base(e), status: "skipped", reason: s.why });
    else candidates.push(e);
  }

  const owner = process.env.OWNER_NAME || account.name || "the owner";
  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    const verdicts = aiConfigured() ? await classifyEmails(batch, { owner, myEmails, today }) : null;
    for (const e of batch) {
      const v = verdicts?.get(e.messageId);
      if (verdicts && v) {
        rows.push(
          v.needs_action && v.title
            ? { ...base(e), status: "pending", source: "claude", title: v.title.slice(0, 200), reason: v.reason?.slice(0, 200) ?? null, dueDate: /^\d{4}-\d{2}-\d{2}$/.test(v.due_date ?? "") ? v.due_date : null, priority: addressedToMe(e, myEmails) ? v.priority : Math.min(v.priority, 1) }
            : { ...base(e), status: "none", source: "claude", reason: v.reason?.slice(0, 200) ?? null },
        );
        continue;
      }
      const r = ruleSuggestion(e, today);
      rows.push(r ? { ...base(e), status: "pending", source: "rules", ...r } : { ...base(e), status: "none", source: "rules" });
    }
  }
  for (const data of rows) {
    await prisma.emailSuggestion.upsert({ where: { accountId_messageId: { accountId, messageId: data.messageId } }, create: data, update: {} });
  }
  await prisma.calendarAccount.update({ where: { id: accountId }, data: { lastEmailScanAt: startedAt } });
  return { read: parsed.length, suggested: rows.filter((r) => r.status === "pending").length };
}

export async function scanAllEmail() {
  if (!googleConfigured()) return { accounts: 0, read: 0, suggested: 0, errors: [] as string[] };
  const accounts = (await prisma.calendarAccount.findMany({ where: { provider: "google", emailEnabled: true } })).filter(canReadEmail);
  const total = { accounts: accounts.length, read: 0, suggested: 0, errors: [] as string[] };
  for (const a of accounts) {
    try {
      const r = await scanAccount(a.id);
      total.read += r.read;
      total.suggested += r.suggested;
    } catch (e) {
      total.errors.push(`${a.email}: ${(e as Error).message}`);
    }
  }
  if (accounts.length) {
    await prisma.syncRun.create({
      data: { kind: "email", status: total.errors.length ? "ERROR" : "SUCCESS", imported: total.suggested, finishedAt: new Date(), message: total.errors.join("; ") || `${total.read} read · ${total.suggested} possible tasks` },
    });
  }
  return total;
}
