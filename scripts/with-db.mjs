#!/usr/bin/env node
/**
 * Runs a command with the database available:
 *   node scripts/with-db.mjs next dev        (npm run dev)
 *   node scripts/with-db.mjs prisma studio   (npm run db:studio)
 * Starts the built-in PostgreSQL first when DATABASE_URL points to this computer and nothing
 * is listening there (no Docker needed). Ctrl+C stops both. If the database was already
 * running (e.g. npm run dev in another window), it is left alone.
 * Before `next dev` it also applies new migrations and regenerates the Prisma Client, so pulling
 * new code is enough — no separate prisma commands needed.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { DATA_DIR, ensureUnpooledUrl, reachable, readDatabaseUrl, startLocalDb } from "./local-db.mjs";

if (ensureUnpooledUrl()) console.log("Added DATABASE_URL_UNPOOLED to .env (direct connection for migrations).");

const db = readDatabaseUrl();
let local = null;

if (db?.isLocal && !(await reachable(db.host, db.port))) {
  if (!existsSync(path.join(DATA_DIR, "PG_VERSION"))) {
    console.error("\n✗ No database yet. Run  npm run setup  first (one time).\n");
    process.exit(1);
  }
  process.stdout.write("Starting the built-in PostgreSQL… ");
  local = await startLocalDb(db);
  console.log("ready.");
}

const [cmd, ...cmdArgs] = process.argv.slice(2);
if (!cmd) {
  console.error("Usage: node scripts/with-db.mjs <command> [args…]");
  process.exit(1);
}
if (cmd === "next" && cmdArgs[0] === "dev") {
  const run = (args) => spawnSync("npx", args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", shell: process.platform === "win32" });
  const migrate = run(["prisma", "migrate", "deploy"]);
  if (migrate.status !== 0) {
    console.error(`\n✗ Couldn't update the database:\n${migrate.stdout}${migrate.stderr}`);
    if (local) await local.stop().catch(() => {});
    process.exit(1);
  }
  if (/migrations? (have been )?applied|Applying migration/i.test(migrate.stdout)) console.log("Database updated to the latest version.");
  const generate = run(["prisma", "generate"]);
  if (generate.status !== 0) console.error(`Warning: prisma generate failed:\n${generate.stderr}`);
}

const next = spawn("npx", [cmd, ...cmdArgs], { stdio: "inherit", shell: process.platform === "win32" });

let stopping = false;
const shutdown = async (code = 0) => {
  if (stopping) return;
  stopping = true;
  next.kill("SIGINT");
  if (local) await local.stop().catch(() => {});
  process.exit(code);
};
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("SIGHUP", () => shutdown(0)); // Terminal window closed
next.on("exit", (code) => shutdown(code ?? 0));
