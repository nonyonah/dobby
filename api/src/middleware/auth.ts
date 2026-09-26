import { clerkClient, getAuth } from "@clerk/express";
import type { RequestHandler } from "express";
import { AppError } from "./errors.js";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";

// Provisioning the user row used to run on every request, which doubled the
// database round trips for every endpoint. The row only needs to exist, so
// re-check it at most once per minute per user.
const ENSURE_TTL_MS = 60_000;
const ensuredAt = new Map<string, number>();

async function ensureUserRow(clerkId: string) {
  const now = Date.now();
  const expiresAt = ensuredAt.get(clerkId);
  if (expiresAt !== undefined && expiresAt > now) return;
  if (ensuredAt.size > 1_000) ensuredAt.clear();
  await prisma.user.upsert({
    where: { clerkId },
    create: { clerkId, profile: { create: {} } },
    update: {},
    select: { clerkId: true },
  });
  ensuredAt.set(clerkId, Date.now() + ENSURE_TTL_MS);
  // Reminders and import emails need an address; Clerk is the source of truth.
  // Best-effort and deferred so a Clerk outage never blocks authentication.
  void backfillEmail(clerkId);
}

/** Copy the Clerk primary email onto the user row when we don't have one. */
async function backfillEmail(clerkId: string): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { clerkId }, select: { email: true } });
    if (user?.email) return;
    const clerkUser = await clerkClient.users.getUser(clerkId);
    const primary = clerkUser.primaryEmailAddressId
      ? clerkUser.emailAddresses.find((entry) => entry.id === clerkUser.primaryEmailAddressId)
      : clerkUser.emailAddresses[0];
    const address = primary?.emailAddress;
    if (!address) return;
    await prisma.user.update({ where: { clerkId }, data: { email: address } }).catch(() => undefined);
  } catch (error) {
    logger.warn({ clerkId, error: error instanceof Error ? error.message : String(error) }, "email backfill failed");
  }
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      next(new AppError(401, "Authentication is required.", "UNAUTHENTICATED"));
      return;
    }

    await ensureUserRow(userId);

    req.auth = { userId };
    next();
  } catch (error) {
    next(error);
  }
};
