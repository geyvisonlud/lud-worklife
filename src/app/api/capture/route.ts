import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { checkCaptureToken, saveToReadLater } from "@/lib/read-later-data";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

/**
 * Read Later from the phone (iOS Shortcut / any HTTP client): POST JSON or form data with `url` and/or `text`
 * (and optional `title`), with `Authorization: Bearer <capture token>` (or `?token=`). The token is on /read-later.
 */
export async function POST(req: Request) {
  const u = new URL(req.url);
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : u.searchParams.get("token");
  if (!(await checkCaptureToken(token))) return NextResponse.json({ error: "Wrong or missing capture token." }, { status: 401 });

  let body: Record<string, unknown> = {};
  const type = req.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) body = await req.json();
    else if (type.includes("form")) body = Object.fromEntries((await req.formData()).entries());
    else body = { text: await req.text() };
  } catch {
    return NextResponse.json({ error: "Couldn't read the request." }, { status: 400 });
  }
  const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 20_000) : Array.isArray(v) ? v.filter((x) => typeof x === "string").join("\n").slice(0, 20_000) : null);
  const item = await saveToReadLater({ url: str(body.url), text: str(body.text), title: str(body.title), via: "phone" });
  if (!item) return NextResponse.json({ error: "Nothing to save — send a url or some text." }, { status: 400 });
  revalidatePath("/read-later");
  return NextResponse.json({ ok: true, title: item.title });
}
