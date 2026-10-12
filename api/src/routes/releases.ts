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

releaseRouter.post("/send", async (req, res) => {
  const input = z.object({
    releaseName: z.string().trim().min(1).max(80),
    notes: z.array(z.object({ title: z.string().trim().min(1).max(80), body: z.string().trim().min(1).max(240) })).min(1).max(5),
    href: z.string().trim().max(200).nullish(),
    /** Restrict to one account, which is how a release gets checked before it goes out. */
    clerkId: z.string().trim().min(1).optional(),
  }).parse(req.body ?? {});

  if (input.clerkId) {
    await sendWhatsNew(input.clerkId, { releaseName: input.releaseName, notes: input.notes, href: input.href });
    logger.info({ clerkId: input.clerkId, releaseName: input.releaseName }, "release email sent to one account");
    res.json({ data: { sent: 1 } });
    return;
  }

  res.status(400).json({
    data: { sent: 0 },
    error: { code: "CLERK_ID_REQUIRED", message: "Send to a single account first. Broadcasting needs a job." },
  });
});
