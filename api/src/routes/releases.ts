/**
 * A campaign send, for "what changed" mail.
 *
 * Releases are not a schedule and not a trigger — they happen when something
 * ships, which is a person deciding it. Exposed as its own endpoint so that
 * decision is one call rather than a redeploy, and so it reuses the same
 * renderer, tokens and unsubscribe line as every other email.
 *
 * Deliberately not wired to a job: a cron that sent this weekly would be a
 * newsletter nobody asked for.
 */

import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { logger } from "../lib/logger.js";
import { sendWhatsNew } from "../lib/mailer.js";

export const releaseRouter = Router();
releaseRouter.use(requireAuth);

/**
 * Whether the caller may send this release to the given account.
 *
 * Only ever to themselves. The endpoint exists so a release can be checked
 * against one real account before it goes out, and a preview of somebody else's
 * inbox is not a thing anybody needs.
 *
 * The previous version took `clerkId` at face value, so any signed-in user
 * could hand this endpoint another account's id and have Dobby email them — an
 * open mail relay behind a login, with no rate limit worth the name and no
 * record beyond a log line. A preview endpoint that reaches other people's
 * inboxes is not a preview endpoint.
 */
export function maySendReleaseTo(callerClerkId: string | undefined, targetClerkId: string): boolean {
  return Boolean(callerClerkId) && callerClerkId === targetClerkId;
}

releaseRouter.post("/send", async (req, res) => {
  const input = z.object({
    releaseName: z.string().trim().min(1).max(80),
    notes: z.array(z.object({ title: z.string().trim().min(1).max(80), body: z.string().trim().min(1).max(240) })).min(1).max(5),
    href: z.string().trim().max(200).nullish(),
    /** Restrict to one account, which is how a release gets checked before it goes out. */
    clerkId: z.string().trim().min(1).optional(),
  }).parse(req.body ?? {});

  const callerClerkId = req.auth!.userId;

  if (!input.clerkId) {
    res.status(400).json({
      data: { sent: 0 },
      error: { code: "CLERK_ID_REQUIRED", message: "Send to a single account first. Broadcasting needs a job." },
    });
    return;
  }

  if (!maySendReleaseTo(callerClerkId, input.clerkId)) {
    logger.warn({ callerClerkId, targetClerkId: input.clerkId, releaseName: input.releaseName }, "blocked cross-account release send");
    res.status(403).json({
      data: { sent: 0 },
      error: { code: "NOT_YOUR_ACCOUNT", message: "You can only send a release preview to your own account." },
    });
    return;
  }

  await sendWhatsNew(callerClerkId, { releaseName: input.releaseName, notes: input.notes, href: input.href });
  logger.info({ clerkId: callerClerkId, releaseName: input.releaseName }, "release email sent to own account");
  res.json({ data: { sent: 1 } });
});
