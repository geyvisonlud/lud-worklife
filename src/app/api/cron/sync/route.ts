import { NextResponse } from "next/server";
import { syncAllCalendars } from "@/lib/google-sync";
import { syncAllNotion } from "@/lib/notion-sync";
import { scanAllEmail } from "@/lib/email-sync";
import { bibleState } from "@/lib/data";
import { notesConfigured, notesFor } from "@/lib/bible-notes";
import { PLAN_DAYS, readingFor } from "@/lib/bible-plan";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Scheduled sync of every Google calendar and Notion workspace (Vercel Cron / GitHub Actions). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const q = new URL(req.url).searchParams.get("secret");
  if (!secret || (auth !== `Bearer ${secret}` && q !== secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [google, notion] = await Promise.allSettled([syncAllCalendars(), syncAllNotion()]);
  // After the calendar sync, so refreshed access tokens are reused.
  const [email] = await Promise.allSettled([scanAllEmail()]);
  // Write today's and tomorrow's Bible study notes ahead of time, so the page opens instantly.
  const [bible] = await Promise.allSettled([
    (async () => {
      const s = await bibleState();
      if (!s.started || !s.current || !notesConfigured()) return { prepared: 0 };
      const days = [s.current, (s.current % PLAN_DAYS) + 1];
      const notes = await notesFor(days.flatMap((d) => readingFor(d).chapters));
      return { prepared: notes.filter((n) => n.note).length };
    })(),
  ]);
  const out = (r: PromiseSettledResult<unknown>) => (r.status === "fulfilled" ? r.value : { error: String(r.reason) });
  return NextResponse.json({ google: out(google), notion: out(notion), email: out(email), bible: out(bible) });
}
