import type { CalendarAccount } from "@prisma/client";
import { prisma } from "./db";
import { decrypt, encrypt } from "./crypto";
import { addDays, appTimeZone, dayBounds, ymdInTz } from "./dates";
import {
  GoogleAuthError,
  googleApi,
  googleConfigured,
  googleList,
  mapCalendar,
  mapEvent,
  refreshAccessToken,
  taskEventBody,
  type GoogleCalendarEntry,
  type GoogleEvent,
} from "./google";
import { getSettings } from "./settings";
import { friendlyGoogleError } from "./google-tasks";

/** Events are kept for this window around today. */
export const SYNC_PAST_DAYS = 21;
export const SYNC_FUTURE_DAYS = 90;

export function syncWindow(now = new Date(), tz = appTimeZone()) {
  const today = ymdInTz(now, tz);
  return { from: dayBounds(addDays(today, -SYNC_PAST_DAYS), tz)[0], to: dayBounds(addDays(today, SYNC_FUTURE_DAYS), tz)[1] };
}

/** A valid access token for the account, refreshing it when it's about to expire. */
export async function accessToken(account: CalendarAccount) {
  if (account.accessToken && account.expiresAt && account.expiresAt.getTime() > Date.now() + 120_000) return decrypt(account.accessToken);
  if (!account.refreshToken) throw new GoogleAuthError("No refresh token — reconnect the account.");
  const t = await refreshAccessToken(decrypt(account.refreshToken));
  await prisma.calendarAccount.update({
    where: { id: account.id },
    data: { accessToken: encrypt(t.access_token), expiresAt: new Date(Date.now() + t.expires_in * 1000) },
  });
  return t.access_token;
}

/** Calendars + events of one account. Demo accounts are left as they are. */
export async function syncAccount(accountId: string) {
  const account = await prisma.calendarAccount.findUniqueOrThrow({ where: { id: accountId } });
  if (account.provider !== "google") return { events: 0 };
  try {
    const token = await accessToken(account);
    const entries = await googleList<GoogleCalendarEntry>(token, "/users/me/calendarList", { minAccessRole: "reader", showHidden: "false", maxResults: "250" });
    const seen: string[] = [];
    for (const entry of entries.filter((e) => !e.deleted)) {
      const c = mapCalendar(entry);
      seen.push(c.externalId);
      const { visibleByDefault, ...fields } = c;
      await prisma.calendar.upsert({
        where: { accountId_externalId: { accountId, externalId: c.externalId } },
        create: { ...fields, accountId, visible: visibleByDefault },
        update: fields, // color, name and permissions follow Google; visibility stays the user's choice here
      });
    }
    await prisma.calendar.deleteMany({ where: { accountId, externalId: { notIn: seen } } });

    const { from, to } = syncWindow();
    const calendars = await prisma.calendar.findMany({ where: { accountId, visible: true } });
    let count = 0;
    for (const cal of calendars) {
      const raw = await googleList<GoogleEvent>(token, `/calendars/${encodeURIComponent(cal.externalId)}/events`, {
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "2500",
      });
      const rows = raw.map((e) => mapEvent(e, cal.timeZone ?? appTimeZone())).filter((e): e is NonNullable<typeof e> => e !== null);
      for (const r of rows) {
        await prisma.event.upsert({
          where: { calendarId_externalId: { calendarId: cal.id, externalId: r.externalId } },
          create: { ...r, calendarId: cal.id },
          update: r,
        });
      }
      // Events inside the window that Google no longer returns were deleted or moved out.
      await prisma.event.deleteMany({
        where: { calendarId: cal.id, start: { gte: from, lt: to }, externalId: { notIn: rows.map((r) => r.externalId) } },
      });
      count += rows.length;
    }
    // Hidden calendars keep no events.
    await prisma.event.deleteMany({ where: { calendar: { accountId, visible: false } } });
    await prisma.calendarAccount.update({ where: { id: accountId }, data: { status: "OK", lastError: null, lastSyncedAt: new Date() } });
    return { events: count };
  } catch (e) {
    const auth = e instanceof GoogleAuthError;
    await prisma.calendarAccount.update({
      where: { id: accountId },
      data: { status: auth ? "RECONNECT" : "ERROR", lastError: friendlyGoogleError(String((e as Error).message ?? e)) },
    });
    throw e;
  }
}

/** Every Google account; one failing account doesn't stop the others. */
export async function syncAllCalendars() {
  if (!googleConfigured()) return { accounts: 0, events: 0, errors: [] as string[] };
  const run = await prisma.syncRun.create({ data: { kind: "google" } });
  const accounts = await prisma.calendarAccount.findMany({ where: { provider: "google" } });
  let events = 0;
  const errors: string[] = [];
  for (const a of accounts) {
    try {
      events += (await syncAccount(a.id)).events;
    } catch (e) {
      errors.push(`${a.email}: ${(e as Error).message}`);
    }
  }
  // Google Tasks, per account, after the calendars (reuses the refreshed tokens).
  const { syncAllTaskLists } = await import("./google-tasks-sync");
  const tasks = await syncAllTaskLists().catch((e) => ({ errors: [String((e as Error).message)] }));
  errors.push(...tasks.errors);
  await prisma.syncRun.update({
    where: { id: run.id },
    data: { status: errors.length ? "ERROR" : "SUCCESS", finishedAt: new Date(), imported: events, message: errors.join("; ") || null },
  });
  return { accounts: accounts.length, events, errors };
}

/* ------------------------------------------------------- scheduled tasks */

/**
 * Mirrors a task's time block in Google (Settings → "Add scheduled tasks to"): creates, moves or
 * deletes the event. Never throws — the task is saved here either way; errors are returned.
 */
export async function mirrorTask(taskId: string): Promise<string | null> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return null;
  try {
    const { taskCalendarId } = await getSettings();
    const existingCal = task.googleCalendarId ? await prisma.calendar.findUnique({ where: { id: task.googleCalendarId }, include: { account: true } }) : null;

    const wantCal =
      task.scheduledStart && taskCalendarId ? await prisma.calendar.findUnique({ where: { id: taskCalendarId }, include: { account: true } }) : null;
    const target = wantCal && wantCal.canWrite && wantCal.account.provider === "google" ? wantCal : null;

    // Remove the old event when the task was unscheduled or the destination calendar changed.
    if (task.googleEventId && existingCal && (!target || existingCal.id !== target.id)) {
      if (existingCal.account.provider === "google") {
        const token = await accessToken(existingCal.account);
        await googleApi(token, `/calendars/${encodeURIComponent(existingCal.externalId)}/events/${task.googleEventId}`, { method: "DELETE" }).catch(() => {});
      }
      await prisma.task.update({ where: { id: task.id }, data: { googleEventId: null, googleCalendarId: null } });
      task.googleEventId = null;
    }
    if (!target || !task.scheduledStart) return null;

    const token = await accessToken(target.account);
    const body = taskEventBody({ ...task, start: task.scheduledStart }, process.env.APP_URL);
    const path = `/calendars/${encodeURIComponent(target.externalId)}/events`;
    if (task.googleEventId) {
      await googleApi(token, `${path}/${task.googleEventId}`, { method: "PATCH", body });
    } else {
      const created = await googleApi<{ id: string }>(token, path, { method: "POST", body });
      await prisma.task.update({ where: { id: task.id }, data: { googleEventId: created.id, googleCalendarId: target.id } });
    }
    return null;
  } catch (e) {
    console.error("mirrorTask", e);
    return `Saved here, but Google Calendar wasn't updated: ${(e as Error).message}`;
  }
}

/** Deletes a task's Google event (before deleting the task). */
export async function removeTaskEvent(taskId: string) {
  await prisma.task.update({ where: { id: taskId }, data: { scheduledStart: null } }).catch(() => {});
  return mirrorTask(taskId);
}
