import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "./auth";

/** Display name for the greeting: OWNER_NAME, else the Google account's first name. */
export async function ownerFirstName() {
  const env = process.env.OWNER_NAME?.trim();
  if (env) return env.split(/\s+/)[0];
  const who = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  const name = who?.split("|")[0]?.trim();
  return name && name !== "owner" && !name.includes("@") ? name.split(/\s+/)[0] : null;
}
