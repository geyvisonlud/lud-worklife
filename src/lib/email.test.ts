import { describe, expect, it } from "vitest";
import { lookbackDays, taskNotesFromEmail, gmailLink, dueFromText, gmailQuery, hasGmailScope, htmlToText, parseAddress, parseGmailMessage, ruleSuggestion, screen, stripQuoted, GMAIL_SCOPE, type GmailMessage } from "./email";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
const TODAY = "2026-11-05"; // Thursday
const ME = ["geyvison@acme.co", "geyvison@gmail.com"];

function msg(o: { from?: string; to?: string; subject?: string; body?: string; html?: string; labels?: string[]; headers?: Record<string, string> } = {}): GmailMessage {
  const headers = [
    { name: "From", value: o.from ?? "Marina Souza <marina@acme.co>" },
    { name: "To", value: o.to ?? "Geyvison <geyvison@acme.co>" },
    { name: "Subject", value: o.subject ?? "Budget for Q1" },
    ...Object.entries(o.headers ?? {}).map(([name, value]) => ({ name, value })),
  ];
  const parts = [];
  if (o.body !== undefined) parts.push({ mimeType: "text/plain", body: { data: b64(o.body) } });
  if (o.html !== undefined) parts.push({ mimeType: "text/html", body: { data: b64(o.html) } });
  return { id: "m1", threadId: "t1", labelIds: o.labels ?? ["INBOX", "CATEGORY_PERSONAL"], internalDate: "1793900000000", payload: { mimeType: "multipart/alternative", headers, parts } };
}

describe("parsing", () => {
  it("reads headers and the plain-text body, without the quoted reply", () => {
    const e = parseGmailMessage(msg({ body: "Can you approve the budget by Friday?\n\nOn Wed, Nov 4, 2026 at 9:00 AM Geyvison <g@acme.co> wrote:\n> old stuff" }));
    expect(e.fromName).toBe("Marina Souza");
    expect(e.fromEmail).toBe("marina@acme.co");
    expect(e.subject).toBe("Budget for Q1");
    expect(e.text).toBe("Can you approve the budget by Friday?");
  });
  it("falls back to HTML", () => {
    const e = parseGmailMessage(msg({ html: "<p>Hi&nbsp;there</p><style>x{}</style><div>Pode revisar &amp; aprovar?</div>" }));
    expect(e.text).toContain("Hi there");
    expect(e.text).toContain("Pode revisar & aprovar?");
  });
  it("helpers", () => {
    expect(parseAddress('"Ana" <ANA@X.COM>')).toEqual({ name: "Ana", email: "ana@x.com" });
    expect(parseAddress("bob@y.com")).toEqual({ name: null, email: "bob@y.com" });
    expect(htmlToText("a<br>b")).toBe("a\nb");
    expect(stripQuoted("Oi\nEm qua., 4 de nov. de 2026 às 09:00, Ana <a@b.com> escreveu:\n> x")).toBe("Oi");
    expect(hasGmailScope(`openid ${GMAIL_SCOPE}`)).toBe(true);
    expect(hasGmailScope("openid")).toBe(false);
    expect(gmailQuery(3)).toContain("-category:promotions");
  });
});

describe("screening out marketing and automated mail", () => {
  const keep = (m: GmailMessage) => screen(parseGmailMessage(m), ME);
  it("keeps a personal email", () => {
    expect(keep(msg({ body: "Can you approve this?" }))).toEqual({ keep: true });
  });
  it("drops Promotions/Social tabs, lists and bulk", () => {
    expect(keep(msg({ body: "x", labels: ["INBOX", "CATEGORY_PROMOTIONS"] })).keep).toBe(false);
    expect(keep(msg({ body: "x", labels: ["INBOX", "CATEGORY_SOCIAL"] })).keep).toBe(false);
    expect(keep(msg({ body: "x", headers: { "List-Unsubscribe": "<mailto:u@x.com>" } })).keep).toBe(false);
    expect(keep(msg({ body: "x", headers: { Precedence: "bulk" } })).keep).toBe(false);
    expect(keep(msg({ body: "x", headers: { "X-Mailchimp-Id": "1" } })).keep).toBe(false);
  });
  it("drops automated senders, auto-replies, unsubscribe footers and my own mail", () => {
    expect(keep(msg({ from: "Shop <no-reply@shop.com>", body: "Please confirm" })).keep).toBe(false);
    expect(keep(msg({ from: "newsletter@company.com", body: "x" })).keep).toBe(false);
    expect(keep(msg({ body: "x", headers: { "Auto-Submitted": "auto-replied" } })).keep).toBe(false);
    expect(keep(msg({ body: "Big sale this week! Click here.\n\nUnsubscribe from these emails" })).keep).toBe(false);
    expect(keep(msg({ from: "Geyvison <geyvison@gmail.com>", body: "note to self" })).keep).toBe(false);
  });
});

describe("rule-based suggestions (no API key)", () => {
  const sug = (body: string, subject = "Budget for Q1") => ruleSuggestion(parseGmailMessage(msg({ body, subject })), TODAY);
  it("turns clear requests into a suggestion with a due date", () => {
    const s = sug("Hi! Could you review the budget and send me your approval by Friday?")!;
    expect(s.title).toBe("Reply to Marina: Budget for Q1");
    expect(s.dueDate).toBe("2026-11-06");
    expect(s.priority).toBeGreaterThanOrEqual(2);
  });
  it("understands Portuguese", () => {
    const s = sug("Oi Geyvison, você pode me mandar o relatório até amanhã?", "Re: Relatório mensal")!;
    expect(s.title).toBe("Reply to Marina: Relatório mensal");
    expect(s.dueDate).toBe("2026-11-06");
  });
  it("ignores FYI mail", () => {
    expect(sug("FYI — the deck is in the shared drive. No action needed.")).toBeNull();
  });
  it("reads due dates", () => {
    expect(dueFromText("até sexta", TODAY)).toBe("2026-11-06");
    expect(dueFromText("by Monday", TODAY)).toBe("2026-11-09");
    expect(dueFromText("before thursday", TODAY)).toBe("2026-11-12");
    expect(dueFromText("send it today", TODAY)).toBe(TODAY);
    expect(dueFromText("whenever", TODAY)).toBeNull();
  });
});

describe("scan window and task notes", () => {
  it("looks back 3 days first, then since the last scan", () => {
    const now = new Date("2026-11-05T12:00:00Z");
    expect(lookbackDays(null, now)).toBe(3);
    expect(lookbackDays(new Date("2026-11-05T11:00:00Z"), now)).toBe(2);
    expect(lookbackDays(new Date("2026-10-01T00:00:00Z"), now)).toBe(7);
  });
  it("links back to the thread in the right account", () => {
    const link = gmailLink("geyvison@acme.co", "t1");
    expect(link).toBe("https://mail.google.com/mail/u/geyvison%40acme.co/#all/t1");
    expect(taskNotesFromEmail({ fromName: "Marina", fromEmail: "m@acme.co", subject: "Budget", snippet: "Can you approve?" }, link)).toContain("Open in Gmail: https://mail.google.com");
  });
});
