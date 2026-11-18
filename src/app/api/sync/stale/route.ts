import { NextResponse } from "next/server";
import { syncGoogleTasksIfStale, syncIfStale } from "@/app/actions";

export const dynamic = "force-dynamic";

/**
 * Background "sync if stale" for pages that open (calendar, Today, Tasks). A route handler, not a server action:
 * server actions from one page run one at a time, so a long sync would hold up saves and checkmarks behind it.
 * Behind the session middleware like every page.
 */
export async function POST(req: Request) {
  const what = new URL(req.url).searchParams.get("what");
  try {
    const r = what === "tasks" ? await syncGoogleTasksIfStale() : await syncIfStale();
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ synced: false, error: String((e as Error).message ?? e) }, { status: 200 });
  }
}
