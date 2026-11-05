import { CalendarRow, DisconnectButton, NotionTokenForm, SyncButton } from "@/components/ConnectionBits";
import { Field } from "@/components/Sheet";
import { Card, GoogleMark, NotionMark, PageHeader } from "@/components/ui";
import { saveSettings } from "@/app/actions";
import { allowedEmails } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDuration, relativeTime } from "@/lib/dates";
import { calendarDTO, lastSyncs } from "@/lib/data";
import { googleConfigured } from "@/lib/google";
import { notionOAuthConfigured } from "@/lib/notion";
import { getSettings } from "@/lib/settings";

const MESSAGES: Record<string, string> = {
  google_config: "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to connect Google calendars.",
  google_denied: "Google access wasn't granted.",
  google_scope: "Calendar access wasn't granted — tick the calendar boxes on Google's consent screen.",
  google_failed: "Couldn't connect that Google account. Please try again.",
  notion_config: "Set NOTION_CLIENT_ID and NOTION_CLIENT_SECRET for the Connect button, or paste an internal integration secret below.",
  notion_denied: "Notion access wasn't granted.",
  notion_owner: "Notion didn't say which user connected. Connect as a workspace member (not a bot).",
  notion_failed: "Couldn't connect Notion. Please try again.",
  state: "The connection expired or was started in another tab. Please try again.",
};

export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<{ error?: string; connected?: string }> }) {
  const sp = await searchParams;
  const [accounts, notion, settings, syncs] = await Promise.all([
    prisma.calendarAccount.findMany({ include: { calendars: { orderBy: [{ primary: "desc" }, { name: "asc" }] } }, orderBy: { createdAt: "asc" } }),
    prisma.notionConnection.findMany({ orderBy: { createdAt: "asc" } }),
    getSettings(),
    lastSyncs(),
  ]);
  const writable = accounts.flatMap((a) => a.calendars.filter((c) => c.canWrite && a.provider === "google").map((c) => ({ id: c.id, label: `${c.name} (${a.email})` })));
  const demoWritable = accounts.flatMap((a) => a.calendars.filter((c) => c.canWrite && a.provider !== "google").map((c) => ({ id: c.id, label: `${c.name} (${a.email}, demo)` })));
  const notionCount = await prisma.project.count({ where: { source: "notion" } });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader eyebrow="Calendars · Notion · Scheduling" title="Connections" />
      {sp.error && <p className="card animate-in !py-3 text-[14px] text-bad">{MESSAGES[sp.error] ?? "Something went wrong."}</p>}
      {sp.connected && <p className="card animate-in !py-3 text-[14px] text-good">Connected {sp.connected}.</p>}

      <Card title="Google Calendar" action={accounts.some((a) => a.provider === "google") ? <SyncButton kind="google" /> : null}>
        <p className="mb-4 text-[13.5px] text-ink-2">
          Connect every Google account you use — personal, work, church. Each calendar keeps the color you gave it in Google. Events sync every few minutes while
          the calendar is open, and on the scheduled sync.
        </p>
        <div className="space-y-4">
          {accounts.map((a) => (
            <div key={a.id} className="rounded-xl border border-hairline bg-surface px-3.5 py-2.5">
              <div className="flex items-center gap-3 border-b border-hairline pb-2.5">
                {a.picture ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.picture} alt="" className="h-8 w-8 rounded-full" referrerPolicy="no-referrer" />
                ) : (
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface-2">
                    <GoogleMark />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14.5px] font-medium">{a.email}</div>
                  <div className={`text-[12px] ${a.status === "OK" ? "text-ink-2" : "text-bad"}`}>
                    {a.provider === "demo"
                      ? "Demo account"
                      : a.status === "RECONNECT"
                        ? "Access expired — reconnect"
                        : a.status === "ERROR"
                          ? a.lastError ?? "Sync error"
                          : a.lastSyncedAt
                            ? `Synced ${relativeTime(a.lastSyncedAt)}`
                            : "Not synced yet"}{" "}
                    · {a.calendars.length} calendars
                  </div>
                </div>
                {a.status === "RECONNECT" && (
                  <a href={`/api/google/connect?hint=${encodeURIComponent(a.email)}`} className="btn btn-secondary">
                    Reconnect
                  </a>
                )}
                <DisconnectButton kind="google" id={a.id} label={a.email} />
              </div>
              <ul>
                {a.calendars.map((c) => (
                  <CalendarRow key={c.id} cal={calendarDTO({ ...c, account: a })} googleColor={c.color} overridden={Boolean(c.customColor)} />
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {googleConfigured() ? (
            <a href="/api/google/connect" className="btn btn-primary">
              <GoogleMark /> {accounts.length ? "Add another Google account" : "Connect Google Calendar"}
            </a>
          ) : (
            <p className="text-[13px] text-ink-3">Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see README) to connect real accounts.</p>
          )}
          {syncs.google?.finishedAt && <span className="text-[12px] text-ink-3">Last sync {relativeTime(syncs.google.finishedAt)}</span>}
        </div>
      </Card>

      <Card title="Notion" action={notion.some((n) => n.method !== "demo") ? <SyncButton kind="notion" /> : null}>
        <p className="mb-4 text-[13.5px] text-ink-2">
          Pages where you're <b className="font-medium text-ink">@mentioned</b> or listed in a <b className="font-medium text-ink">People</b> property (Owner, Assignee, Team…) are imported as
          projects, with a read-only copy of the page. To-dos that @mention you become tasks, and a status like “In progress” or “Done” places the card on the board. Only
          pages shared with the integration can be seen.
        </p>
        {notion.map((n) => (
          <div key={n.id} className="mb-3 flex items-center gap-3 rounded-xl border border-hairline bg-surface px-3.5 py-3">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-[9px] bg-surface-2 text-[17px]">{n.workspaceIcon && !n.workspaceIcon.startsWith("http") ? n.workspaceIcon : <NotionMark size={17} />}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14.5px] font-medium">{n.workspaceName}</div>
              <div className={`truncate text-[12px] ${n.status === "OK" ? "text-ink-2" : "text-bad"}`}>
                {n.method === "demo" ? "Demo workspace" : n.status === "ERROR" ? n.lastError : n.lastSyncedAt ? `Checked ${relativeTime(n.lastSyncedAt)}` : "Not synced yet"} · as{" "}
                {n.userName ?? n.userEmail ?? "you"}
              </div>
            </div>
            <DisconnectButton kind="notion" id={n.id} label={n.workspaceName} />
          </div>
        ))}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-surface-2 p-3.5">
            <div className="mb-1 text-[14px] font-medium">Public integration</div>
            <p className="mb-3 text-[12.5px] text-ink-2">Sign in to Notion and choose the teamspaces and pages to share. Knows who you are automatically.</p>
            {notionOAuthConfigured() ? (
              <a href="/api/notion/connect" className="btn btn-primary">
                <NotionMark size={14} /> Connect Notion
              </a>
            ) : (
              <p className="text-[12px] text-ink-3">Needs NOTION_CLIENT_ID and NOTION_CLIENT_SECRET.</p>
            )}
          </div>
          <div className="rounded-xl bg-surface-2 p-3.5">
            <div className="mb-1 text-[14px] font-medium">Internal integration</div>
            <p className="mb-3 text-[12.5px] text-ink-2">Paste its secret, then share the company pages with it (••• → Connections). It needs the “read user information including email” capability.</p>
            <NotionTokenForm defaultEmail={allowedEmails()[0] ?? ""} />
          </div>
        </div>
        <p className="mt-3 text-[12px] text-ink-3">
          {notionCount} project{notionCount === 1 ? "" : "s"} imported
          {syncs.notion?.finishedAt ? ` · last import ${relativeTime(syncs.notion.finishedAt)}${syncs.notion.message ? ` (${syncs.notion.message})` : ""}` : ""}
        </p>
      </Card>

      <Card title="Scheduling">
        <form action={saveSettings} className="space-y-4">
          <Field label="Add scheduled tasks to" hint="When you drop a task on the calendar, an event is also created in this Google calendar (and moved or removed with the task).">
            <select name="taskCalendarId" defaultValue={settings.taskCalendarId} className="input !text-[14px]">
              <option value="">Don't add — keep time blocks in Lud Worklife only</option>
              {writable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
              {demoWritable.map((c) => (
                <option key={c.id} value={c.id} disabled>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Default task length">
              <select name="defaultDuration" defaultValue={settings.defaultDuration} className="input !text-[14px]">
                {[15, 30, 45, 60, 90, 120].map((d) => (
                  <option key={d} value={d}>
                    {formatDuration(d)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Week starts on">
              <select name="weekStart" defaultValue={String(settings.weekStart)} className="input !text-[14px]">
                <option value="0">Sunday</option>
                <option value="1">Monday</option>
              </select>
            </Field>
          </div>
          <button className="btn btn-primary">Save</button>
        </form>
      </Card>
    </div>
  );
}
