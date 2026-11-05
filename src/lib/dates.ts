/**
 * Calendar dates in the owner's time zone (APP_TIMEZONE), independent of where the code runs
 * (Vercel runs in UTC, the browser may be traveling). Days are "YYYY-MM-DD" strings; instants are Dates.
 */

export const DEFAULT_TZ = "America/New_York";
export const appTimeZone = () => process.env.APP_TIMEZONE || DEFAULT_TZ;

const pad = (n: number) => String(n).padStart(2, "0");

const partsCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string) {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsCache.set(tz, f);
  }
  return f;
}

/** Wall-clock parts of an instant in a time zone. */
export function zonedParts(d: Date, tz: string) {
  const p: Record<string, number> = {};
  for (const x of fmt(tz).formatToParts(d)) if (x.type !== "literal") p[x.type] = Number(x.value);
  return { year: p.year, month: p.month, day: p.day, hour: p.hour === 24 ? 0 : p.hour, minute: p.minute, second: p.second };
}

/** "YYYY-MM-DD" of an instant in a time zone. */
export function ymdInTz(d: Date, tz: string) {
  const p = zonedParts(d, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Minutes since local midnight (0–1439) of an instant in a time zone. */
export function minutesInTz(d: Date, tz: string) {
  const p = zonedParts(d, tz);
  return p.hour * 60 + p.minute;
}

/**
 * Wall-clock minutes of an instant relative to a local day's midnight (−60 = 11 PM the day before,
 * 1500 = 1 AM the next day). Unlike elapsed time, 10 AM is 600 even on DST change days.
 */
export function wallMinutes(d: Date, day: string, tz: string) {
  return daysBetween(day, ymdInTz(d, tz)) * 1440 + minutesInTz(d, tz);
}

/** Offset (minutes east of UTC) of a time zone at an instant. */
export function tzOffset(d: Date, tz: string) {
  const p = zonedParts(d, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(d.getTime() / 1000) * 1000) / 60000);
}

/** The instant of a wall-clock time (day + minutes after midnight) in a time zone. DST-safe. */
export function zonedToUtc(ymd: string, minutes: number, tz: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  // Two passes settle the offset across DST changes.
  let t = guess - tzOffset(new Date(guess), tz) * 60000;
  t = guess - tzOffset(new Date(t), tz) * 60000;
  return new Date(t);
}

export function addDays(ymd: string, n: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** 0 = Sunday … 6 = Saturday. */
export const weekday = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

/** First day of the week containing `ymd` (weeks start on Sunday like Google Calendar's US default; 1 = Monday). */
export function startOfWeek(ymd: string, weekStartsOn = 0) {
  return addDays(ymd, -((weekday(ymd) - weekStartsOn + 7) % 7));
}

export const daysBetween = (a: string, b: string) => {
  const t = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((t(b) - t(a)) / 86400000);
};

/** [start, end) of a local day as instants. */
export function dayBounds(ymd: string, tz: string): [Date, Date] {
  return [zonedToUtc(ymd, 0, tz), zonedToUtc(addDays(ymd, 1), 0, tz)];
}

export const isYmd = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/** Rounds minutes to the nearest step (15 min by default), clamped to the day. */
export function snapMinutes(min: number, step = 15) {
  return Math.max(0, Math.min(24 * 60 - step, Math.round(min / step) * step));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LONG_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Thu, Nov 5" */
export function formatDay(ymd: string, opts: { long?: boolean; year?: boolean } = {}) {
  const [y, m, d] = ymd.split("-").map(Number);
  const wd = (opts.long ? LONG_DAYS : DAYS)[weekday(ymd)];
  return `${wd}, ${MONTHS[m - 1]} ${d}${opts.year ? `, ${y}` : ""}`;
}

/** "Nov 2 – 8, 2026" / "Oct 26 – Nov 1, 2026" */
export function formatRange(from: string, to: string) {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  if (y1 !== y2) return `${MONTHS[m1 - 1]} ${d1}, ${y1} – ${MONTHS[m2 - 1]} ${d2}, ${y2}`;
  if (m1 !== m2) return `${MONTHS[m1 - 1]} ${d1} – ${MONTHS[m2 - 1]} ${d2}, ${y2}`;
  if (d1 === d2) return `${MONTHS[m1 - 1]} ${d1}, ${y1}`;
  return `${MONTHS[m1 - 1]} ${d1} – ${d2}, ${y2}`;
}

export const monthName = (m: number) => MONTHS[m - 1];
export const dayShort = (ymd: string) => DAYS[weekday(ymd)];

/** "9:30 AM", "12 PM" */
export function formatClock(minutes: number) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${pad(m)}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

/** "9:30 – 10:15 AM", "11 AM – 1 PM" */
export function formatClockRange(start: number, end: number) {
  const a = formatClock(start);
  const b = formatClock(end % (24 * 60));
  const [aT, aP] = a.split(" ");
  const [, bP] = b.split(" ");
  return aP === bP ? `${aT} – ${b}` : `${a} – ${b}`;
}

/** "45 min", "1 h", "1 h 30" */
export function formatDuration(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${pad(m)}` : `${h} h`;
}

/** "Today", "Tomorrow", "Yesterday", "Mon, Nov 9" relative to `today`. */
export function relativeDay(ymd: string, today: string) {
  const diff = daysBetween(today, ymd);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return formatDay(ymd);
}

export function relativeTime(d: Date, now = new Date()) {
  const s = Math.round((now.getTime() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/** "Good morning" in a time zone. */
export function greeting(d: Date, tz: string) {
  const h = zonedParts(d, tz).hour;
  return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
