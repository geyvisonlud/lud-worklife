/**
 * Finds the database URLs under the names Vercel's Neon integration (and Vercel Postgres) use,
 * so the app works whether you set DATABASE_URL yourself or let the integration add its variables.
 * Shared by scripts/migrate.mjs and src/lib/db.ts (keep the lists in sync).
 */
import { unpooled } from "./local-db.mjs";

export const POOLED_NAMES = ["DATABASE_URL", "POSTGRES_PRISMA_URL", "POSTGRES_URL", "NEON_DATABASE_URL"];
export const DIRECT_NAMES = ["DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING", "DATABASE_URL_NON_POOLING", "POSTGRES_URL_UNPOOLED"];

/** Fills DATABASE_URL and DATABASE_URL_UNPOOLED in `env` from whatever is present. Returns the names it used. */
export function resolveDbEnv(env = process.env) {
  const pooledName = POOLED_NAMES.find((n) => env[n]);
  const directName = DIRECT_NAMES.find((n) => env[n]);
  if (!env.DATABASE_URL && pooledName) env.DATABASE_URL = env[pooledName];
  if (!env.DATABASE_URL && directName) env.DATABASE_URL = env[directName];
  if (!env.DATABASE_URL_UNPOOLED) env.DATABASE_URL_UNPOOLED = directName ? env[directName] : env.DATABASE_URL ? unpooled(env.DATABASE_URL) : undefined;
  if (!env.DATABASE_URL_UNPOOLED) delete env.DATABASE_URL_UNPOOLED;
  return { pooledName: pooledName ?? null, directName: directName ?? null };
}
