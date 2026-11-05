/**
 * Google Calendar: OAuth (one connection per Google account, as many accounts as you like),
 * the API calls we need and the pure mapping from Google's JSON to our rows (tested in google.test.ts).
 * No SDK: plain fetch against https://www.googleapis.com/calendar/v3.
 */
import { googleCalendarColor, googleEventColor } from "./colors";
import { zonedToUtc } from "./dates";

export const GOOGLE_AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";

/** Read every calendar in the account, and create/move/delete the events for scheduled tasks. */
export const CALENDAR_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  // Read-only: the inbox is scanned for possible tasks (Today → Possible tasks). Nothing is sent or changed.
  "https://www.googleapis.com/auth/gmail.readonly",
];

export const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export const calendarRedirectUri = (base: string) => `${base.replace(/\/+$/, "")}/api/google/callback`;

export function calendarAuthorizeUrl(opts: { clientId: string; redirectUri: string; state: string; loginHint?: string }) {
  const p = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: CALENDAR_SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    // consent → Google always returns a refresh token; select_account → pick which account to add.
    prompt: "consent select_account",
    state: opts.state,
  });
  if (opts.loginHint) p.set("login_hint", opts.loginHint);
  return `${GOOGLE_AUTHORIZE}?${p}`;
}

/* ------------------------------------------------------------------ mapping */

export type GoogleCalendarEntry = {
  id: string;
  summary?: string;
  summaryOverride?: string;
  colorId?: string;
  backgroundColor?: string;
  primary?: boolean;
  accessRole?: string;
  selected?: boolean;
  hidden?: boolean;
  timeZone?: string;
  deleted?: boolean;
};

export function mapCalendar(c: GoogleCalendarEntry) {
  return {
    externalId: c.id,
    name: c.summaryOverride || c.summary || c.id,
    color: googleCalendarColor(c),
    primary: Boolean(c.primary),
    canWrite: c.accessRole === "owner" || c.accessRole === "writer",
    timeZone: c.timeZone ?? null,
    /** Calendars unchecked in Google start hidden here too. */
    visibleByDefault: c.selected !== false && !c.hidden,
  };
}

type GTime = { date?: string; dateTime?: string; timeZone?: string };
export type GoogleEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: GTime;
  end?: GTime;
  colorId?: string;
  htmlLink?: string;
  hangoutLink?: string;
  eventType?: string;
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  attendees?: { self?: boolean; responseStatus?: string }[];
  extendedProperties?: { private?: Record<string, string> };
};

/** All-day dates are stored as UTC midnight of the date (read back with toISOString().slice(0, 10)). */
const dateAsUtc = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

/** Google event → Event row fields; null for events we don't show (cancelled, working location, our own task blocks). */
export function mapEvent(e: GoogleEvent, calendarTz = "UTC") {
  if (e.status === "cancelled" || !e.start || !e.end) return null;
  if (e.eventType === "workingLocation") return null;
  if (e.extendedProperties?.private?.ludTaskId) return null; // shown as the task itself
  const allDay = Boolean(e.start.date);
  let start: Date;
  let end: Date;
  if (allDay) {
    start = dateAsUtc(e.start.date!);
    end = dateAsUtc(e.end.date ?? e.start.date!);
  } else if (e.start.dateTime) {
    start = new Date(e.start.dateTime);
    end = new Date(e.end.dateTime ?? e.start.dateTime);
    // dateTime always carries an offset in API responses; guard against a bare local time anyway.
    if (!/[zZ]|[+-]\d\d:?\d\d$/.test(e.start.dateTime)) {
      const tz = e.start.timeZone || calendarTz;
      const [d, t] = e.start.dateTime.split("T");
      const [h, m] = t.split(":").map(Number);
      start = zonedToUtc(d, h * 60 + m, tz);
    }
  } else return null;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end < start) end = start;
  const me = e.attendees?.find((a) => a.self);
  const video = e.hangoutLink ?? e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri ?? null;
  return {
    externalId: e.id,
    title: e.summary?.trim() || "(No title)",
    description: e.description ?? null,
    location: e.location ?? null,
    start,
    end,
    allDay,
    color: googleEventColor(e.colorId),
    htmlLink: e.htmlLink ?? null,
    meetLink: video,
    responseStatus: me?.responseStatus ?? null,
  };
}

/** Body of the Google event created for a scheduled task. */
export function taskEventBody(task: { id: string; title: string; notes?: string | null; start: Date; durationMin: number }, appUrl?: string) {
  const end = new Date(task.start.getTime() + task.durationMin * 60000);
  const link = appUrl ? `\n\n${appUrl.replace(/\/+$/, "")}/tasks?task=${task.id}` : "";
  return {
    summary: task.title,
    description: `${task.notes ?? ""}${link}`.trim() || undefined,
    start: { dateTime: task.start.toISOString() },
    end: { dateTime: end.toISOString() },
    extendedProperties: { private: { ludTaskId: task.id } },
    reminders: { useDefault: false, overrides: [] },
  };
}

/** Claims of the ID token that comes back with the calendar connection (decoded, not verified: it came over TLS from Google). */
export function idTokenProfile(idToken: string | undefined) {
  if (!idToken) return null;
  try {
    const payload = idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
    if (typeof json.email !== "string") return null;
    return { email: json.email.toLowerCase() as string, name: (json.name as string) ?? null, picture: (json.picture as string) ?? null };
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------- HTTP */

export class GoogleAuthError extends Error {}

export async function exchangeCode(code: string, redirectUri: string) {
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description || json.error || "Token exchange failed");
  return json as { access_token: string; refresh_token?: string; expires_in: number; id_token?: string; scope?: string };
}

export async function refreshAccessToken(refreshToken: string) {
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    if (json.error === "invalid_grant") throw new GoogleAuthError("Google access was revoked or expired — reconnect the account.");
    throw new Error(json.error_description || json.error || "Token refresh failed");
  }
  return json as { access_token: string; expires_in: number };
}

export async function googleApi<T>(token: string, path: string, init: { method?: string; body?: unknown; query?: Record<string, string> } = {}): Promise<T> {
  const url = `${API}${path}${init.query ? `?${new URLSearchParams(init.query)}` : ""}`;
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) throw new GoogleAuthError("Google rejected the access token.");
  if (!res.ok) throw new Error(json?.error?.message || `Google Calendar error ${res.status}`);
  return json as T;
}

/** All pages of a list endpoint. */
export async function googleList<T>(token: string, path: string, query: Record<string, string>, max = 20) {
  const items: T[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < max; i++) {
    const page = await googleApi<{ items?: T[]; nextPageToken?: string }>(token, path, { query: { ...query, ...(pageToken ? { pageToken } : {}) } });
    items.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
    if (!pageToken) break;
  }
  return items;
}
