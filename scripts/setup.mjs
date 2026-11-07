#!/usr/bin/env node
/**
 * One-command local setup:  npm run setup
 *
 * 1. Creates .env from .env.example if it doesn't exist.
 * 2. Makes sure the database in DATABASE_URL answers. For a local database that isn't
 *    running yet it uses Docker (when Docker is already running) or the built-in
 *    PostgreSQL that ships with the project (no install needed; data in .pgdata/).
 * 3. Applies the migrations.
 * 4. Loads the demo data, only into an empty LOCAL database (never into a remote one
 *    unless you pass --seed).
 *
 * Flags: --seed (also seed a remote/empty DB), --no-seed (skip demo data).
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { ensureUnpooledUrl, reachable, readDatabaseUrl, startLocalDb } from "./local-db.mjs";

/** Handle to the built-in PostgreSQL when setup started it (stopped at the end; `npm run dev` starts it again). */
let localDb = null;

const args = new Set(process.argv.slice(2));
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const step = (s) => console.log(`\n${bold("›")} ${s}`);
const fail = (msg, hint) => {
  console.error(`\n${red("✗")} ${msg}`);
  if (hint) console.error(`  ${hint.split("\n").join("\n  ")}`);
  process.exit(1);
};

const run = (cmd, argv, opts = {}) => spawnSync(cmd, argv, { encoding: "utf8", shell: process.platform === "win32", ...opts });
const ok = (cmd, argv) => run(cmd, argv, { stdio: "ignore" }).status === 0;

/* ------------------------------------------------------------------ .env */
step("Checking .env");
if (!existsSync(".env")) {
  copyFileSync(".env.example", ".env");
  console.log(`  Created ${bold(".env")} from .env.example`);
} else console.log("  .env found");
if (ensureUnpooledUrl()) console.log(`  Added ${bold("DATABASE_URL_UNPOOLED")} to .env (direct connection for migrations)`);

const env = readFileSync(".env", "utf8");
const url = (env.match(/^\s*DATABASE_URL\s*=\s*"?([^"\n]+)"?/m) || [])[1];
if (!url) fail("DATABASE_URL is missing in .env", 'Add a line like DATABASE_URL="postgresql://worklife:worklife@localhost:5433/worklife"');
let host, port;
try {
  const u = new URL(url);
  host = u.hostname;
  port = Number(u.port || 5432);
} catch {
  fail("DATABASE_URL in .env is not a valid URL", url);
}
const isLocal = ["localhost", "127.0.0.1", "::1"].includes(host);
const password = (env.match(/^\s*APP_PASSWORD\s*=\s*"?([^"\n]*)"?/m) || [])[1];

/* -------------------------------------------------------------- database */
step(`Checking the database at ${host}:${port}`);
if (await reachable(host, port)) {
  console.log("  Database is answering");
} else if (!isLocal) {
  fail(
    `Can't reach ${host}:${port}`,
    "Check DATABASE_URL in .env (for Neon, copy the direct connection string with ?sslmode=require)\nand your internet connection.",
  );
} else {
  // Local database: use Docker if it's already running, otherwise the built-in PostgreSQL.
  if (ok("docker", ["info"]) && existsSync("docker-compose.yml")) {
    console.log("  Docker is running — starting the database container…");
    const compose = run("docker", ["compose", "up", "-d", "db"]);
    const out = `${compose.stdout ?? ""}${compose.stderr ?? ""}`;
    if (compose.status !== 0) {
      if (/port is already allocated|address already in use/i.test(out)) {
        fail(
          `Port ${port} is already used by another program (often another PostgreSQL).`,
          "Stop it — e.g. brew services stop postgresql, or quit Postgres.app — and run npm run setup again.",
        );
      }
      fail("docker compose couldn't start the database:", out.trim());
    }
    let ready = false;
    for (let i = 0; i < 45 && !ready; i++) {
      ready = (await reachable(host, port)) && ok("docker", ["compose", "exec", "-T", "db", "pg_isready", "-U", "worklife"]);
      if (!ready) await sleep(1000);
    }
    if (!ready) fail("The database container started but isn't accepting connections.", "Run docker compose logs db to see why.");
    console.log("  Database is ready (Docker)");
  } else {
    console.log("  Starting the built-in PostgreSQL (no Docker needed; data in .pgdata/)…");
    try {
      const db = readDatabaseUrl();
      localDb = await startLocalDb(db);
      const { firstRun } = localDb;
      console.log(`  Database is ready${firstRun ? " (created)" : ""}`);
    } catch (e) {
      fail(
        "Couldn't start the built-in PostgreSQL.",
        `${e?.message ?? e}\nAlternative: put a free Neon connection string (neon.tech) in DATABASE_URL in .env and run npm run setup again.`,
      );
    }
  }
}

/* ------------------------------------------------------------ migrations */
step("Applying database migrations");
const migrate = run("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit" });
if (migrate.status !== 0) fail("Migrations failed (see the message above).");

/* ------------------------------------------------------------- demo data */
let seeded = false;
if (!args.has("--no-seed")) {
  step("Checking for data");
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const [projects, tasks, accounts] = await Promise.all([prisma.project.count(), prisma.task.count(), prisma.calendarAccount.count()]);
  await prisma.$disconnect();
  const empty = projects === 0 && tasks === 0 && accounts === 0;
  if (empty && (isLocal || args.has("--seed"))) {
    console.log("  Empty database — loading demo data");
    const seed = run("npm", ["run", "db:seed"], { stdio: "inherit" });
    if (seed.status !== 0) fail("Loading the demo data failed (see the message above).");
    seeded = true;
  } else if (empty) {
    console.log("  Remote database is empty — skipping demo data (use --seed to load it).");
  } else console.log("  Data already there — leaving it as is");
}

/* ----------------------------------------------------------------- done */
if (localDb) await localDb.stop();
console.log(`\n${green("✓")} ${bold("All set.")} Now run:\n\n    ${bold("npm run dev")}\n`);
console.log(`  Then open ${bold("http://localhost:3000")}`);
if (password) console.log(`  Password: ${bold(password)} ${dim("(APP_PASSWORD in .env)")}`);
if (seeded) console.log(dim("  You're looking at demo data; connect your Google calendars and Notion in Connections."));
console.log("");
