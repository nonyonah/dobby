import { prisma } from "../lib/prisma.js";
import { AppError } from "./errors.js";

/**
 * Throws unless the signed-in user is on the Pro plan.
 *
 * Call it as the first line of a Pro-gated handler rather than as route
 * middleware: Express infers `req.params` types from the route signature, and
 * an extra middleware argument degrades them. Free-tier callers get a 403 with
 * `UPGRADE_REQUIRED` and a plain-language message, so the client can show an
 * upgrade prompt instead of a generic failure.
 *
 * Read-only endpoints that only report state (connection status lists,
 * disconnect, deletes) stay ungated so Free accounts are never stuck.
 */
export async function assertPro(userId: string | undefined, feature: string): Promise<void> {
  if (!userId) {
    throw new AppError(401, "Authentication is required.", "UNAUTHENTICATED");
  }
  const user = await prisma.user.findUnique({ where: { clerkId: userId }, select: { plan: true } });
  if (user?.plan !== "PRO") {
    throw new AppError(
      403,
      `${feature} is part of Dobby Pro. Upgrade to unlock it — everything else keeps working on Free.`,
      "UPGRADE_REQUIRED",
    );
  }
}
