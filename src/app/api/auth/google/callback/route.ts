import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE, allowedEmails, baseUrl, createSessionToken, googleLoginConfigured } from "@/lib/auth";
import { GOOGLE_TOKEN } from "@/lib/google";

export const dynamic = "force-dynamic";

const decode = (jwt: string) => JSON.parse(Buffer.from(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
const safeNext = (n: string | undefined) => (n && n.startsWith("/") && !n.startsWith("//") ? n : "/");

export async function GET(req: Request) {
  const base = baseUrl(req);
  const fail = (code: string) => NextResponse.redirect(`${base}/login?error=${code}`, 303);
  if (!googleLoginConfigured()) return fail("config");
  const q = new URL(req.url).searchParams;
  const cookie = req.headers.get("cookie")?.match(/lw_login=([^;]+)/)?.[1];
  const [state, nonce, next] = cookie ? decodeURIComponent(cookie).split(".") : [];
  if (q.get("error")) return fail("failed");
  if (!cookie || q.get("state") !== state || !q.get("code")) return fail("state");

  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: q.get("code")!,
      redirect_uri: `${base}/api/auth/google/callback`,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  }).catch(() => null);
  const json = res ? await res.json().catch(() => null) : null;
  if (!res?.ok || !json?.id_token) return fail("failed");

  // The ID token came straight from Google's token endpoint over TLS (OIDC Core 3.1.3.7).
  const claims = decode(json.id_token);
  const now = Math.floor(Date.now() / 1000);
  const issOk = ["https://accounts.google.com", "accounts.google.com"].includes(claims.iss);
  if (!issOk || claims.aud !== process.env.GOOGLE_CLIENT_ID || claims.exp < now - 60 || claims.nonce !== nonce) return fail("invalid");
  const email = String(claims.email ?? "").toLowerCase();
  if (!email || claims.email_verified !== true) return fail("unverified");
  if (!allowedEmails().includes(email)) return fail("not_allowed");

  const out = NextResponse.redirect(`${base}${safeNext(decodeURIComponent(next ?? "/"))}`, 303);
  out.cookies.set(SESSION_COOKIE, await createSessionToken(`${claims.given_name ?? claims.name ?? "owner"}|${email}`), {
    httpOnly: true,
    secure: base.startsWith("https://"),
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
  out.cookies.delete("lw_login");
  return out;
}
