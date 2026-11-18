#!/usr/bin/env node
/**
 * `prisma migrate deploy` for builds (Vercel). Migrations need the direct (non-pooled) connection:
 * DATABASE_URL_UNPOOLED, the integration's POSTGRES_URL_NON_POOLING, or DATABASE_URL without "-pooler".
 */
import { spawnSync } from "node:child_process";
import { DIRECT_NAMES, POOLED_NAMES, resolveDbEnv } from "./db-env.mjs";

const env = { ...process.env };
resolveDbEnv(env);
if (!env.DATABASE_URL) {
  console.error(`
✗ No database configured for this build.

  Set DATABASE_URL in Vercel → Project → Settings → Environment Variables
  (your Neon connection string, e.g. postgresql://…@ep-xxx-pooler.….neon.tech/neondb?sslmode=require),
  or connect Neon in Vercel → Storage, which adds the variables for you.
  Looked for: ${[...POOLED_NAMES, ...DIRECT_NAMES].join(", ")}
  Then redeploy.
`);
  process.exit(1);
}
const r = spawnSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit", env, shell: process.platform === "win32" });
process.exit(r.status ?? 1);
