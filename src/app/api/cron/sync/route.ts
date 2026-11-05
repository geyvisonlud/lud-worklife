import { NextResponse } from "next/server";
import { syncAllCalendars } from "@/lib/google-sync";
import { syncAllNotion } from "@/lib/notion-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Scheduled sync of every Google calendar and Notion workspace (Vercel Cron / GitHub Actions). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const q = new URL(req.url).searchParams.get("secret");
  if (!secret || (auth !== `Bearer ${secret}` && q !== secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [google, notion] = await Promise.allSettled([syncAllCalendars(), syncAllNotion()]);
  const out = (r: PromiseSettledResult<unknown>) => (r.status === "fulfilled" ? r.value : { error: String(r.reason) });
  return NextResponse.json({ google: out(google), notion: out(notion) });
}
