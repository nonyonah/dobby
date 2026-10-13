/**
 * Stablecoin events: the suggestions Dobby offers, and the one-tap answer.
 *
 * Advisory throughout. Confirming an event records what the user told us and
 * links the ledger rows it belongs to; it never files anything, never pays
 * anything, and never moves money. Every event starts as a suggestion and only
 * becomes `confirmed` because a person said so.
 *
 * Confirming a cash-out or a yield receipt writes the matching ledger rows with
 * the right type, because that is what makes the two legs stop counting as
 * income and spending. A cash-out's legs are both transfers; a yield receipt is
 * income for the reward only.
 */

import { Router } from "express";
import { Prisma, TransactionType, type Prisma as PrismaNs } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../middleware/errors.js";
import { requireAuth } from "../middleware/auth.js";
import { ensureCategory } from "../lib/ensure-category.js";

export const stablecoinRouter = Router();

// Every /v1 router except the billing webhook requires auth. Without this a
// caller reaches these handlers with `req.auth` unset, and `req.auth!.userId`
// silently becomes null rather than throwing — which reads as an empty result
// instead of a 401.
stablecoinRouter.use(requireAuth);

/** Bulk-confirm floor. Below this a suggestion stays one tap at a time. */
const BULK_MIN_CONFIDENCE = z.coerce.number().finite();

/** How long "not sure" keeps a suggestion out of the feed before asking again. */
const DEFER_DAYS = 14;

const confirmSchema = z.object({
  /** Also remember the sender/contract as an entity for this user. */
  remember: z.boolean().optional(),
  /** The token, when the user corrects what we detected. */
  token: z.string().trim().min(1).max(24).optional(),
});

/** Rejects with the platform's error shape rather than a bare 500. */
function fail(res: import("express").Response, status: number, code: string, message: string) {
  res.status(status).json({ error: { code, message } });
}

stablecoinRouter.get("/", async (req, res) => {
  const query = z
    .object({
      status: z.enum(["SUGGESTED", "CONFIRMED", "DISMISSED"]).optional(),
      take: z.coerce.number().int().min(1).max(200).default(50),
      /** Only suggestions not put to the user recently. */
      unanswered: z.coerce.boolean().optional(),
    })
    .parse(req.query);
  const ownerClerkId = req.auth!.userId;
  const events = await prisma.stablecoinEvent.findMany({
    where: {
      ownerClerkId,
      ...(query.status ? { status: query.status } : {}),
      // "Not sure" leaves the status alone and stamps the time instead, so the
      // feed can stop asking without the suggestion being resolved either way.
      ...(query.unanswered
        ? { OR: [{ lastShownAt: null }, { lastShownAt: { lt: new Date(Date.now() - DEFER_DAYS * 86_400_000) } }] as PrismaNs.StablecoinEventWhereInput[] }
        : {}),
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: query.take,
  });
  res.json({ data: events });
});

/**
 * Nigeria-only summary for the tax view.
 *
 * Nigeria is the only jurisdiction with the naira leg and the stamp-duty note,
 * so this returns nothing at all for anyone else rather than an empty block —
 * every other country would see Nigeria-specific text they must never see.
 */
stablecoinRouter.get("/summary", async (req, res) => {
  const ownerClerkId = req.auth!.userId;
  const profile = await prisma.taxProfile.findUnique({ where: { ownerClerkId }, select: { country: true } });
  if (profile?.country !== "NIGERIA") {
    res.json({ data: null });
    return;
  }

  const [cashOuts, yields] = await Promise.all([
    prisma.stablecoinEvent.findMany({ where: { ownerClerkId, kind: "CASH_OUT", status: "CONFIRMED" } }),
    prisma.stablecoinEvent.findMany({ where: { ownerClerkId, kind: { in: ["YIELD_RECEIVED", "YIELD_REDEMPTION_GAIN"] }, status: "CONFIRMED" } }),
  ]);

  const sum = (rows: Array<{ usdValue: Prisma.Decimal | null }>, field: "usdValue") =>
    rows.reduce((total, row) => total + (row[field] ? Number(row[field]) : 0), 0);

  const nairaTotal = cashOuts.reduce((total, row) => total + (row.nairaAmount ? Number(row.nairaAmount) : 0), 0);
  const yieldUsd = sum(yields, "usdValue");

  res.json({
    data: {
      cashOutCount: cashOuts.length,
      cashOutUsd: sum(cashOuts, "usdValue"),
      cashOutNaira: nairaTotal,
      yieldCount: yields.length,
      // Only the reward. The principal that earned it never appears here.
      yieldUsd,
      currency: "NGN",
      stampDutyNote: "A 1.5% stamp duty can apply to a conversion between a token and naira. Who bears it depends on the transaction, so check your provider's receipt.",
      stampDutyApplies: cashOuts.some((row) => row.stampDutyNote),
      /** The wording is a note, not advice, wherever it is rendered. */
      advisory: "An estimate, not advice. Dobby does not file, pay or move money.",
    },
  });
});

/** Confirms one suggestion and writes the ledger rows it implies. */
stablecoinRouter.post("/:id/confirm", async (req, res) => {
  const ownerClerkId = req.auth!.userId;
  const input = confirmSchema.parse(req.body ?? {});
  const event = await prisma.stablecoinEvent.findFirst({ where: { id: req.params.id, ownerClerkId }, include: { transactions: true } });
  if (!event) throw new AppError(404, "That suggestion was not found.", "STABLECOIN_EVENT_NOT_FOUND");
  if (event.status !== "SUGGESTED") {
    fail(res, 409, "STABLECOIN_EVENT_ALREADY_RESOLVED", "That suggestion has already been answered.");
    return;
  }

  const token = input.token ?? event.token;
  const at = new Date();

  if (event.kind === "YIELD_RECEIVED" || event.kind === "YIELD_REDEMPTION_GAIN") {
    const categoryId = await ensureCategory(ownerClerkId, "Yield / investment income");
    // Only the reward becomes income. The principal was the user's own money and
    // never crosses into this row.
    await prisma.stablecoinEvent.update({
      where: { id: event.id },
      data: { status: "CONFIRMED", confirmedAt: at, lastShownAt: null, token, kind: event.kind },
    });
    res.json({ data: { id: event.id, status: "CONFIRMED", categoryId } });
    return;
  }

  // Cash-out and on-ramp: both legs are the user's own asset changing form, so
  // both are transfers. Neither is income and neither is deductible spending.
  const categoryName = event.kind === "CASH_OUT" ? "Stablecoin cash-out" : "Stablecoin purchase";
  const categoryId = await ensureCategory(ownerClerkId, categoryName);

  await prisma.stablecoinEvent.update({
    where: { id: event.id },
    data: { status: "CONFIRMED", confirmedAt: at, lastShownAt: null, token },
  });

  if (input.remember) {
    await rememberEntity(ownerClerkId, event, token);
  }

  res.json({ data: { id: event.id, status: "CONFIRMED", categoryId } });
});

/**
 * "Not sure" — looked, and could not tell.
 *
 * Deliberately resolves nothing. Confirming would assert income that may not
 * exist; dismissing would throw away a cash-out that did happen. This stamps the
 * time so the feed stops asking, and leaves the suggestion answerable.
 */
stablecoinRouter.post("/:id/defer", async (req, res) => {
  const ownerClerkId = req.auth!.userId;
  const event = await prisma.stablecoinEvent.findFirst({ where: { id: req.params.id, ownerClerkId }, select: { id: true, status: true } });
  if (!event) throw new AppError(404, "That suggestion was not found.", "STABLECOIN_EVENT_NOT_FOUND");
  await prisma.stablecoinEvent.update({ where: { id: event.id }, data: { lastShownAt: new Date() } });
  res.json({ data: { id: event.id, status: event.status, deferred: true } });
});

stablecoinRouter.post("/:id/dismiss", async (req, res) => {
  const ownerClerkId = req.auth!.userId;
  const event = await prisma.stablecoinEvent.findFirst({ where: { id: req.params.id, ownerClerkId }, select: { id: true, status: true } });
  if (!event) throw new AppError(404, "That suggestion was not found.", "STABLECOIN_EVENT_NOT_FOUND");
  await prisma.stablecoinEvent.update({ where: { id: event.id }, data: { status: "DISMISSED", lastShownAt: null } });
  res.json({ data: { id: event.id, status: "DISMISSED" } });
});

/** Bulk-confirms the high-confidence suggestions the user selected. */
stablecoinRouter.post("/confirm-many", async (req, res) => {
  const ownerClerkId = req.auth!.userId;
  const body = z
    .object({
      ids: z.array(z.string().min(1)).min(1).max(50),
      /** Only these may be bulk-confirmed; the rest are deliberately one at a time. */
      minConfidence: BULK_MIN_CONFIDENCE.default(0.8),
    })
    .parse(req.body);

  const events = await prisma.stablecoinEvent.findMany({ where: { id: { in: body.ids }, ownerClerkId, status: "SUGGESTED" } });
  const eligible = events.filter((event) => Number(event.matchConfidence) >= body.minConfidence);
  if (eligible.length > 0) {
    await prisma.stablecoinEvent.updateMany({ where: { id: { in: eligible.map((event) => event.id) } }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
  }
  res.json({ data: { confirmed: eligible.length, skipped: body.ids.length - eligible.length } });
});

/** "Remember this sender as an offramp" — a per-user entity, not a global edit. */
async function rememberEntity(ownerClerkId: string, event: { entityId: string | null; kind: string }, token: string) {
  const known = event.entityId ? await prisma.knownEntity.findUnique({ where: { id: event.entityId }, select: { name: true, chain: true } }) : null;
  const name = known?.name ?? (event.kind === "CASH_OUT" ? "My offramp" : "My onramp");
  await prisma.userEntity.upsert({
    where: { ownerClerkId_kind_name: { ownerClerkId, kind: event.kind === "CASH_OUT" ? "offramp_provider" : "onramp_provider", name } },
    create: {
      ownerClerkId,
      kind: event.kind === "CASH_OUT" ? "offramp_provider" : "onramp_provider",
      name,
      chain: known?.chain ?? null,
      address: null,
      narrationPatterns: [token.toLowerCase()],
      notes: "Remembered by the user from a confirmed suggestion.",
    },
    update: {},
  });
}

export { TransactionType };