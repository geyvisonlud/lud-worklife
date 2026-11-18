import { NextResponse } from "next/server";
import { baseUrl, checkState } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { exchangeNotionCode, notionRedirectUri } from "@/lib/notion";
import { syncNotionConnection } from "@/lib/notion-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const base = baseUrl(req);
  const back = (q: string) => NextResponse.redirect(`${base}/connections?${q}`, 303);
  const q = new URL(req.url).searchParams;
  if (q.get("error")) return back("error=notion_denied");
  if (!(await checkState(q.get("state"), "notion")) || !q.get("code")) return back("error=state");
  try {
    const t = await exchangeNotionCode(q.get("code")!, notionRedirectUri(base));
    const me = t.owner?.user;
    if (!me?.id) return back("error=notion_owner");
    const data = {
      method: "oauth",
      workspaceName: t.workspace_name || "Notion",
      workspaceIcon: t.workspace_icon ?? null,
      accessToken: encrypt(t.access_token),
      userId: me.id,
      userName: me.name ?? null,
      userEmail: me.person?.email ?? null,
      status: "OK",
      lastError: null,
    };
    const conn = await prisma.notionConnection.upsert({ where: { workspaceId: t.workspace_id }, create: { workspaceId: t.workspace_id, ...data }, update: data });
    await syncNotionConnection(conn).catch((e) => console.error("first notion sync", e));
    return back(`connected=${encodeURIComponent(data.workspaceName)}`);
  } catch (e) {
    console.error("notion callback", e);
    return back("error=notion_failed");
  }
}
