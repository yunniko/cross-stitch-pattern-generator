import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * The Postgres client (G-075) -- this project's first database, so there is exactly one of these.
 *
 * A singleton across dev hot-reloads: Next's dev server re-evaluates this module on every edit, and a
 * fresh `PrismaClient` each time exhausts Postgres's connection limit within a few reloads (a known
 * Next.js + Prisma pitfall; `listing-studio` and `arfid-meals` carry the same guard).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
