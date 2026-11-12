import { NextResponse } from "next/server";
import { baseUrl, googleLoginConfigured } from "@/lib/auth";
import { GOOGLE_AUTHORIZE } from "@/lib/google";

export const dynamic = "force-dynamic";
const LOGIN_STATE_COOKIE = "lw_login";

/** Sign in with Google (identity only; calendars are connected separately in Connections). */
export async function GET(req: Request) {
  const base = baseUrl(req);
  if (!googleLoginConfigured()) return NextResponse.redirect(`${base}/login?error=config`, 303);
  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  const next = new URL(req.url).searchParams.get("next") ?? "/";
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${base}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    prompt: "select_account",
    state,
    nonce,
  });
  const res = NextResponse.redirect(`${GOOGLE_AUTHORIZE}?${p}`);
  res.cookies.set(LOGIN_STATE_COOKIE, [state, nonce, encodeURIComponent(next)].join("."), {
    httpOnly: true,
    path: "/",
    maxAge: 600,
    sameSite: "lax",
    secure: base.startsWith("https://"),
  });
  return res;
}
