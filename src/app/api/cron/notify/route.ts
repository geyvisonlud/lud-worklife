import { NextResponse } from "next/server";
import { runReminders } from "@/lib/notify-data";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Sends due reminders (events, task time blocks, morning digest). Call every 5 minutes (GitHub Actions / any cron). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const q = new URL(req.url).searchParams.get("secret");
  if (!secret || (auth !== `Bearer ${secret}` && q !== secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await runReminders());
}
