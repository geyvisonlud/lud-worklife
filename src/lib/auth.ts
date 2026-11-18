/**
 * Single-user auth + signed (HMAC) cookie. Works on Edge and Node (same scheme as Lud Finances).
 * Sign in with Google (only the emails in ALLOWED_EMAILS) and/or a password (APP_PASSWORD).
 * With neither set, the app runs without a login (local use).
 */
export const SESSION_COOKIE = "lw_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export const googleLoginConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.ALLOWED_EMAILS);

export const authEnabled = () => Boolean(process.env.APP_PASSWORD) || googleLoginConfigured();

export const passwordOk = (password: string) => Boolean(process.env.APP_PASSWORD) && password === process.env.APP_PASSWORD;

export async function hmac(value: string) {
  const secret = process.env.SESSION_SECRET || process.env.APP_PASSWORD || "dev";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/=+$/, "");
const unb64 = (s: string) => decodeURIComponent(escape(atob(s)));

export async function createSessionToken(who = "owner") {
  const exp = Date.now() + SESSION_MAX_AGE * 1000;
  const payload = `${exp}.${b64(who)}`;
  return `${payload}.${await hmac(payload)}`;
}

/** Returns the session subject, or null when the token is missing, expired or forged. */
export async function verifySessionToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [exp, who, sig] = parts;
  if (!exp || Number(exp) < Date.now()) return null;
  const expected = await hmac(`${exp}.${who}`);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    return unb64(who);
  } catch {
    return null;
  }
}

/** Short-lived signed value for OAuth `state` (calendar and Notion connections). */
export async function signState(purpose: string) {
  const nonce = crypto.randomUUID();
  const exp = Date.now() + 10 * 60_000;
  const v = `${purpose}.${nonce}.${exp}`;
  return `${v}.${(await hmac(v)).slice(0, 32)}`;
}

export async function checkState(state: string | null, purpose: string) {
  if (!state) return false;
  const [p, nonce, exp, sig] = state.split(".");
  if (p !== purpose || !nonce || Number(exp) < Date.now()) return false;
  return (await hmac(`${p}.${nonce}.${exp}`)).slice(0, 32) === sig;
}

export const allowedEmails = (raw = process.env.ALLOWED_EMAILS ?? "") =>
  raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

/** Public base URL: APP_URL, or the origin the browser used. */
export function baseUrl(req: Request) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}
