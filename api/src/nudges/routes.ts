import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { entitlementSelect } from "../lib/entitlement.js";
import { NUDGE_RULES } from "./config.js";
import { IN_APP_DISMISS_DAYS } from "./config.js";
import { buildContext, chooseRule } from "./engine.js";

export const nudgeRouter = Router();
nudgeRouter.use(requireAuth);

/**
 * The in-app nudge card.
 *
 * One at a time, highest priority first, and a dismissed card stays gone for a
 * fortnight — long enough that it cannot be dismissed and immediately reappear,
 * which is how a nudge becomes wallpaper.
 */

const nudgeView = {
  key: z.string(),
  headline: z.string(),
  body: z.string(),
  ctaLabel: z.string(),
  ctaHref: z.string(),
} as const;

nudgeRouter.get("/", async (req, res) => {
  const clerkId = req.auth!.userId;
  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { clerkId: true, email: true, firstName: true, timezone: true, createdAt: true, lastActiveAt: true, nudgeInAppEnabled: true, nudgeEmailsEnabled: true, ...entitlementSelect },
  });
  if (!user || !user.nudgeInAppEnabled) {
    res.json({ data: { nudge: null } });
    return;
  }

  // Dismissed cards stay hidden; so does anything sent very recently, which is
  // what stops an email nudge and a card nudge arriving about the same thing.
  const cutoff = new Date(Date.now() - IN_APP_DISMISS_DAYS * 86_400_000);
  const recentlyHandled = await prisma.nudgeLog.findFirst({
    where: {
      ownerClerkId: clerkId,
      channel: "in_app",
      OR: [{ dismissedAt: { gte: cutoff } }, { completedAt: { gte: cutoff } }, { sentAt: { gte: new Date(Date.now() - 3 * 86_400_000) } }],
    },
    orderBy: { sentAt: "desc" },
  });
  if (recentlyHandled) {
    res.json({ data: { nudge: null } });
    return;
  }

  const now = new Date();
  // The same context the sweep builds. Hardcoded placeholders here would let the
  // dashboard show a card for a state the engine never sees, which reads as the
  // product lying about what it knows.
  const context = await buildContext(user, new Map(), now);

  // The card mirrors the engine's own choice: same rules, same priority order,
  // so the thing on screen is the thing that would have been emailed.
  const rule = chooseRule(
    [...NUDGE_RULES].sort((left, right) => left.priority - right.priority),
    context,
    "in_app",
  );
  if (!rule) {
    res.json({ data: { nudge: null } });
    return;
  }

  const copy = rule.copy(context);
  res.json({ data: { nudge: { ...copy, key: rule.key, ctaHref: copy.ctaPath } } });
});

nudgeRouter.post("/:key/dismiss", async (req, res) => {
  const key = z.string().trim().min(1).max(60).parse(req.params.key);
  const clerkId = req.auth!.userId;
  // Marks the most recent showing rather than inserting a row: a dismissal is an
  // event on a card that was already delivered, and a new row would count
  // against the rule's send budget it never consumed.
  const latest = await prisma.nudgeLog.findFirst({
    where: { ownerClerkId: clerkId, nudgeKey: key, channel: "in_app" },
    orderBy: { sentAt: "desc" },
    select: { id: true, dismissedAt: true },
  });
  if (latest) {
    await prisma.nudgeLog.update({ where: { id: latest.id }, data: { dismissedAt: new Date() } });
  }
  res.json({ data: { dismissed: true } });
});

nudgeRouter.post("/:key/complete", async (req, res) => {
  const key = z.string().trim().min(1).max(60).parse(req.params.key);
  const clerkId = req.auth!.userId;
  await prisma.nudgeLog.updateMany({
    where: { ownerClerkId: clerkId, nudgeKey: key, completedAt: null },
    data: { completedAt: new Date(), clickedAt: new Date() },
  });
  res.json({ data: { completed: true } });
});