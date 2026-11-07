/**
 * Built-in PostgreSQL for local use (no Docker needed). Data lives in ./.pgdata.
 * Used by `npm run setup` and `npm run dev` when DATABASE_URL points to localhost
 * and nothing is listening there yet.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";

export const DATA_DIR = path.resolve(".pgdata");

export function readDatabaseUrl() {
  const env = existsSync(".env") ? readFileSync(".env", "utf8") : "";
  const raw = process.env.DATABASE_URL || (env.match(/^\s*DATABASE_URL\s*=\s*"?([^"\n]+)"?/m) || [])[1];
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return {
      raw,
      host: u.hostname,
      port: Number(u.port || 5432),
      user: decodeURIComponent(u.username || "postgres"),
      password: decodeURIComponent(u.password || ""),
      database: u.pathname.replace(/^\//, "") || "postgres",
      isLocal: ["localhost", "127.0.0.1", "::1"].includes(u.hostname),
    };
  } catch {
    return null;
  }
}

export const reachable = (host, port, ms = 1500) =>
  new Promise((resolve) => {
    const s = net.connect({ host, port });
    const done = (v) => {
      s.destroy();
      resolve(v);
    };
    s.setTimeout(ms, () => done(false));
    s.once("connect", () => done(true));
    s.once("error", () => done(false));
  });

/** Starts the built-in PostgreSQL with the user/password/database from DATABASE_URL. Returns a stop() function. */
export async function startLocalDb(db, { quiet = false } = {}) {
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const firstRun = !existsSync(path.join(DATA_DIR, "PG_VERSION"));
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    port: db.port,
    user: db.user,
    password: db.password || "postgres",
    persistent: true,
    onLog: () => {},
    onError: (e) => {
      if (!quiet) console.error(String(e));
    },
  });
  if (firstRun) await pg.initialise();
  await pg.start();
  if (firstRun) {
    try {
      await pg.createDatabase(db.database);
    } catch {
      /* already exists */
    }
  }
  return { stop: () => pg.stop(), firstRun };
}

/** Neon's direct (non-pooled) URL is the pooled one without "-pooler" in the host. */
export const unpooled = (url) => url.replace(/(@[^/:]*?)-pooler\./, "$1.");

/**
 * Prisma runs migrations over DATABASE_URL_UNPOOLED. Older .env files don't have it:
 * add it (derived from DATABASE_URL) so `npm run dev` keeps working after a git pull.
 */
export function ensureUnpooledUrl() {
  if (!existsSync(".env")) return false;
  const env = readFileSync(".env", "utf8");
  if (/^\s*DATABASE_URL_UNPOOLED\s*=/m.test(env)) return false;
  const url = (env.match(/^\s*DATABASE_URL\s*=\s*"?([^"\n]+)"?/m) || [])[1];
  if (!url) return false;
  appendFileSync(".env", `${env.endsWith("\n") ? "" : "\n"}DATABASE_URL_UNPOOLED="${unpooled(url)}"\n`);
  return true;
}
