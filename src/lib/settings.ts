import { prisma } from "./db";

/** Key/value settings stored in the database. */
export const SETTING_KEYS = {
  /** Calendar.id that receives an event for every task dropped on the calendar ("" = keep tasks here only). */
  taskCalendar: "taskCalendarId",
  /** Default task length in minutes when dropped on the calendar. */
  defaultDuration: "defaultDuration",
  /** First day of the week: "0" Sunday, "1" Monday. */
  weekStart: "weekStart",
  /** First day (YYYY-MM-DD) of the Bible-in-a-year plan; empty = not started. */
  biblePlanStart: "biblePlanStart",
  /** Secret for /api/capture (Read Later from the phone's share sheet); empty = not set up. */
  captureToken: "captureToken",
} as const;

export async function getSetting(key: string, fallback = "") {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? fallback;
}

export async function setSetting(key: string, value: string) {
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

export async function getSettings() {
  const rows = await prisma.setting.findMany();
  const m = new Map(rows.map((r) => [r.key, r.value]));
  return {
    taskCalendarId: m.get(SETTING_KEYS.taskCalendar) ?? "",
    defaultDuration: Number(m.get(SETTING_KEYS.defaultDuration) ?? 30) || 30,
    weekStart: m.get(SETTING_KEYS.weekStart) === "1" ? 1 : 0,
  };
}
