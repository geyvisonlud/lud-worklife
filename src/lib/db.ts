import { PrismaClient } from "@prisma/client";

/** Same fallbacks as scripts/db-env.mjs: accept the variable names Vercel's Neon integration adds. */
function resolveDbEnv(env: NodeJS.ProcessEnv) {
  const pick = (names: string[]) => names.map((n) => env[n]).find(Boolean);
  env.DATABASE_URL ||= pick(["POSTGRES_PRISMA_URL", "POSTGRES_URL", "NEON_DATABASE_URL", "DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING"]);
  env.DATABASE_URL_UNPOOLED ||= pick(["POSTGRES_URL_NON_POOLING", "DATABASE_URL_NON_POOLING", "POSTGRES_URL_UNPOOLED"]) ?? env.DATABASE_URL?.replace(/(@[^/:]*?)-pooler\./, "$1.");
}
resolveDbEnv(process.env);

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
