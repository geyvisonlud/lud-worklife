import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { runReminders } from "@/lib/notify-data";
import { syncAllInboxes } from "@/lib/notion-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Sends due reminders (events, task time blocks, morning digest) and imports the Notion Dashboard Inbox. Call every 5 minutes. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const q = new URL(req.url).searchParams.get("secret");
  if (!secret || (auth !== `Bearer ${secret}` && q !== secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Every 5 minutes is also a good beat for the Notion Dashboard Inbox (new tasks/projects added from Notion).
  const [reminders, inbox] = await Promise.all([runReminders(), syncAllInboxes(4 * 60_000).catch((e) => ({ error: String((e as Error).message ?? e) }))]);
  if ("imported" in inbox && inbox.imported) revalidatePath("/", "layout");
  return NextResponse.json({ ...reminders, inbox });
}
