#!/usr/bin/env node
/**
 * `prisma migrate deploy` for builds (Vercel): migrations need the direct connection.
 * If DATABASE_URL_UNPOOLED isn't set, it's derived from DATABASE_URL (Neon: drop "-pooler").
 */
import { spawnSync } from "node:child_process";
import { unpooled } from "./local-db.mjs";

const env = { ...process.env };
if (!env.DATABASE_URL_UNPOOLED && env.DATABASE_URL) env.DATABASE_URL_UNPOOLED = unpooled(env.DATABASE_URL);
const r = spawnSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit", env, shell: process.platform === "win32" });
process.exit(r.status ?? 1);
