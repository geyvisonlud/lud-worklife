import webpush from "web-push";
import { prisma } from "./db";
import { decrypt, encrypt } from "./crypto";
import { appTimeZone, ymdInTz } from "./dates";
import { getSetting, setSetting } from "./settings";
import { dueReminders, parsePrefs, type NotifyPrefs, type Reminder } from "./notify";

const K = { pub: "vapidPublicKey", priv: "vapidPrivateKey", prefs: "notifyPrefs", lastRun: "notifyLastRun" };

/** The app's Web Push keys: made once and kept in the database (the private key encrypted), so nothing needs setting up. */
export async function vapidKeys() {
  const [pub, priv] = await Promise.all([getSetting(K.pub), getSetting(K.priv)]);
  if (pub && priv) return { publicKey: pub, privateKey: decrypt(priv) };
  const keys = webpush.generateVAPIDKeys();
  await setSetting(K.pub, keys.publicKey);
  await setSetting(K.priv, encrypt(keys.privateKey));
  return keys;
}

export async function notifyPrefs() {
  return parsePrefs(await getSetting(K.prefs));
}

export async function saveNotifyPrefs(p: NotifyPrefs) {
  await setSetting(K.prefs, JSON.stringify(p));
}

/** Send to every device; devices that are gone (unsubscribed, app removed) are forgotten. Returns how many got it. */
export async function pushToAll(n: { title: string; body: string; url: string; tag?: string }) {
  const subs = await prisma.pushSubscription.findMany();
  if (!subs.length) return 0;
  const { publicKey, privateKey } = await vapidKeys();
  webpush.setVapidDetails(process.env.APP_URL?.startsWith("https://") ? process.env.APP_URL : "https://lud-worklife.vercel.app", publicKey, privateKey);
  const payload = JSON.stringify({ title: n.title, body: n.body, url: n.url, tag: n.tag });
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600, urgency: "high" });
        sent++;
        await prisma.pushSubscription.update({ where: { id: s.id }, data: { lastUsed: new Date() } });
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        else console.error("push", code, (e as Error).message);
      }
    }),
  );
  return sent;
}

/** Check what's due now and send it (called every few minutes by the scheduled job). */
export async function runReminders(now = new Date()) {
  // Shown on the Notifications card ("Last check …") so it's easy to see the scheduled job is calling in.
  await setSetting(K.lastRun, now.toISOString());
  const tz = appTimeZone();
  const today = ymdInTz(now, tz);
  const soon = new Date(now.getTime() + 61 * 60000);
  const recent = new Date(now.getTime() - 5 * 60000);
  const [prefs, subs, events, blocks, dueToday, overdue] = await Promise.all([
    notifyPrefs(),
    prisma.pushSubscription.count(),
    prisma.event.findMany({ where: { allDay: false, start: { gte: recent, lt: soon }, calendar: { visible: true } }, include: { calendar: { select: { name: true } } } }),
    prisma.task.findMany({ where: { scheduledStart: { gte: recent, lt: soon }, status: { not: "done" } }, select: { id: true, title: true, scheduledStart: true, durationMin: true } }),
    prisma.task.findMany({ where: { dueDate: today, status: { not: "done" } }, select: { title: true }, orderBy: [{ priority: "desc" }, { position: "asc" }] }),
    prisma.task.count({ where: { dueDate: { lt: today }, status: { not: "done" } } }),
  ]);
  if (!subs) return { sent: 0, due: 0 };
  const due = dueReminders({
    now,
    tz,
    today,
    prefs,
    events: events.map((e) => ({ id: e.id, title: e.title, start: e.start, end: e.end, allDay: e.allDay, calendar: e.calendar.name, location: e.location, declined: e.responseStatus === "declined" })),
    blocks: blocks.map((b) => ({ id: b.id, title: b.title, start: b.scheduledStart!, durationMin: b.durationMin })),
    dueToday,
    overdue,
  });
  const already = new Set((await prisma.notificationLog.findMany({ where: { key: { in: due.map((d) => d.key) } }, select: { key: true } })).map((r) => r.key));
  const fresh: Reminder[] = due.filter((d) => !already.has(d.key));
  for (const r of fresh) {
    // Claim the key first: two overlapping runs can't both send it.
    const claimed = await prisma.notificationLog.create({ data: { key: r.key } }).then(() => true, () => false);
    if (claimed) await pushToAll({ ...r, tag: r.key });
  }
  // Keep two weeks of history.
  await prisma.notificationLog.deleteMany({ where: { sentAt: { lt: new Date(now.getTime() - 14 * 86400_000) } } });
  return { sent: fresh.length, due: due.length };
}

/** When the scheduled job last checked for reminders (null = never). */
export async function lastReminderRun() {
  const v = await getSetting(K.lastRun);
  return v ? new Date(v) : null;
}
