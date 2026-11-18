import { NextResponse } from "next/server";
import { baseUrl, signState } from "@/lib/auth";
import { calendarAuthorizeUrl, calendarRedirectUri, googleConfigured } from "@/lib/google";

export const dynamic = "force-dynamic";

/** Connections → "Add Google account": Google's consent screen for one more account. */
export async function GET(req: Request) {
  const base = baseUrl(req);
  if (!googleConfigured()) return NextResponse.redirect(`${base}/connections?error=google_config`, 303);
  const hint = new URL(req.url).searchParams.get("hint") ?? undefined;
  return NextResponse.redirect(
    calendarAuthorizeUrl({ clientId: process.env.GOOGLE_CLIENT_ID!, redirectUri: calendarRedirectUri(base), state: await signState("google"), loginHint: hint }),
  );
}
