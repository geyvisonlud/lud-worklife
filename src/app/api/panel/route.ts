import { NextResponse } from "next/server";
import { addMonths, monthWeeks } from "@/lib/calendar-month";
import { addDays, isYmd } from "@/lib/dates";
import { eventsBetween, listTasks, today } from "@/lib/data";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * Data for the right-hand panel (mini month, the selected day, all tasks): events of the month grid around `month`
 * and the open tasks (plus time blocks in that range). A route, not a server action, so it never waits behind saves.
 */
export async function GET(req: Request) {
  const m = new URL(req.url).searchParams.get("month");
  const month = m && isYmd(`${m}-01`) ? `${m}-01` : `${today().slice(0, 7)}-01`;
  const { weekStart } = await getSettings();
  const from = monthWeeks(month, weekStart, true)[0][0];
  const to = addDays(monthWeeks(addMonths(month, 0), weekStart, true)[5][6], 1);
  const [events, tasks] = await Promise.all([
    eventsBetween(from, to),
    listTasks({ OR: [{ status: { not: "done" } }, { completedAt: { gte: new Date(Date.now() - 12 * 3600_000) } }] }),
  ]);
  return NextResponse.json({ month, weekStart, events, tasks }, { headers: { "Cache-Control": "no-store" } });
}
