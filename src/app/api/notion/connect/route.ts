import { NextResponse } from "next/server";
import { baseUrl, signState } from "@/lib/auth";
import { notionAuthorizeUrl, notionOAuthConfigured, notionRedirectUri } from "@/lib/notion";

export const dynamic = "force-dynamic";

/** Connections → "Connect Notion": pick the workspace and the pages/teamspaces to share. */
export async function GET(req: Request) {
  const base = baseUrl(req);
  if (!notionOAuthConfigured()) return NextResponse.redirect(`${base}/connections?error=notion_config`, 303);
  return NextResponse.redirect(notionAuthorizeUrl({ clientId: process.env.NOTION_CLIENT_ID!, redirectUri: notionRedirectUri(base), state: await signState("notion") }));
}
