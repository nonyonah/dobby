import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Pool defaults for the hosted (pgbouncer) database, applied only when the
 * URL doesn't set them: Prisma's computed default (5 on small hosts) starves
 * under concurrent approves/imports, and the 10s pool timeout turns every
 * pooler stall into a user-facing 500.
 */
function datasourceUrl(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set.");
  const url = new URL(raw);
  if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", "20");
  if (!url.searchParams.has("pool_timeout")) url.searchParams.set("pool_timeout", "30");
  if (!url.searchParams.has("connect_timeout")) url.searchParams.set("connect_timeout", "10");
  return url.toString();
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: datasourceUrl(),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
