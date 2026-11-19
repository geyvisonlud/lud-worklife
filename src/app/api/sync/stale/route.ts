import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { syncGoogleTasksIfStale, syncIfStale } from "@/app/actions";
import { syncAllInboxes } from "@/lib/notion-sync";

export const dynamic = "force-dynamic";

/**
 * Background "sync if stale" for pages that open (calendar, Today, Tasks). A route handler, not a server action:
 * server actions from one page run one at a time, so a long sync would hold up saves and checkmarks behind it.
 * Behind the session middleware like every page.
 */
export async function POST(req: Request) {
  const what = new URL(req.url).searchParams.get("what");
  try {
    if (what === "tasks") {
      // Google Tasks + the Notion Dashboard Inbox (tasks/projects added from Notion, e.g. by Claude).
      const [g, inbox] = await Promise.all([syncGoogleTasksIfStale(), syncAllInboxes(2 * 60_000).catch(() => ({ imported: 0 }))]);
      if (inbox.imported) revalidatePath("/", "layout");
      return NextResponse.json({ synced: g.synced || inbox.imported > 0 });
    }
    return NextResponse.json(await syncIfStale());
  } catch (e) {
    return NextResponse.json({ synced: false, error: String((e as Error).message ?? e) }, { status: 200 });
  }
}
