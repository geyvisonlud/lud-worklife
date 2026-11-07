import { NextResponse } from "next/server";
import { baseUrl, checkState } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { calendarRedirectUri, exchangeCode, idTokenProfile } from "@/lib/google";
import { syncAccount } from "@/lib/google-sync";
import { scanAccount } from "@/lib/email-sync";
import { syncTaskLists } from "@/lib/google-tasks-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const base = baseUrl(req);
  const back = (q: string) => NextResponse.redirect(`${base}/connections?${q}`, 303);
  const q = new URL(req.url).searchParams;
  if (q.get("error")) return back("error=google_denied");
  if (!(await checkState(q.get("state"), "google")) || !q.get("code")) return back("error=state");
  try {
    const t = await exchangeCode(q.get("code")!, calendarRedirectUri(base));
    if (!t.scope?.includes("calendar")) return back("error=google_scope");
    const profile = idTokenProfile(t.id_token);
    if (!profile) return back("error=google_failed");
    const data = {
      provider: "google",
      name: profile.name,
      picture: profile.picture,
      accessToken: encrypt(t.access_token),
      expiresAt: new Date(Date.now() + t.expires_in * 1000),
      status: "OK",
      lastError: null,
      scopes: t.scope ?? null,
      ...(t.refresh_token ? { refreshToken: encrypt(t.refresh_token) } : {}),
    };
    const account = await prisma.calendarAccount.upsert({ where: { email: profile.email }, create: { email: profile.email, ...data }, update: data });
    await syncAccount(account.id).catch((e) => console.error("first calendar sync", e));
    await syncTaskLists(account.id).catch((e) => console.error("first Google Tasks sync", e));
    await scanAccount(account.id).catch((e) => console.error("first email scan", e));
    return back(`connected=${encodeURIComponent(profile.email)}`);
  } catch (e) {
    console.error("google callback", e);
    return back("error=google_failed");
  }
}
