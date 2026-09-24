import { Prisma, ReviewStatus, TransactionType } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { convertCurrencyAmount } from "../providers/frankfurter.js";

export const reviewsRouter = Router();
reviewsRouter.use(requireAuth);

const proposedTransactionSchema = z.object({
  type: z.nativeEnum(TransactionType),
  amount: z.number().finite().positive(),
  currency: z.string().trim().length(3).toUpperCase().optional(),
  categoryId: z.string().trim().min(1).optional(),
  description: z.string().min(1).max(240),
  occurredAt: z.coerce.date(),
  merchant: z.string().max(160).nullable().optional(),
});

reviewsRouter.get("/", async (req, res) => {
  const status = z.nativeEnum(ReviewStatus).optional().parse(req.query.status);
  const items = await prisma.transactionReviewItem.findMany({
    where: { ownerClerkId: req.auth!.userId, ...(status ? { status } : {}) },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    take: 200,
    include: { import: { select: { id: true, originalName: true, status: true } } },
  });
  const profile = await prisma.profile.findUnique({ where: { clerkId: req.auth!.userId }, select: { currency: true } });
  const activeCurrency = profile?.currency?.toUpperCase() ?? "USD";
  const data = await Promise.all(items.map(async (item) => {
    const proposed = item.proposedData && typeof item.proposedData === "object" && !Array.isArray(item.proposedData) ? item.proposedData as { amount?: number; currency?: string } : undefined;
    const sourceCurrency = proposed?.currency ?? (item.rawData && typeof item.rawData === "object" && !Array.isArray(item.rawData) ? (item.rawData as { currency?: string }).currency : undefined) ?? "USD";
    const sourceAmount = Number(proposed?.amount ?? 0);
    let displayAmount = sourceAmount;
    try { displayAmount = await convertCurrencyAmount(sourceAmount, sourceCurrency, activeCurrency); } catch { /* Keep the source amount if the rate provider does not support the pair. */ }
    return { ...item, displayAmount, displayCurrency: activeCurrency, sourceCurrency };
  }));
  res.json({ data });
});

reviewsRouter.post("/:id/approve", async (req, res) => {
  const ownerClerkId = req.auth!.userId;
  const item = await prisma.transactionReviewItem.findFirst({ where: { id: req.params.id, ownerClerkId } });
  if (!item) {
    res.status(404).json({ error: { code: "REVIEW_ITEM_NOT_FOUND", message: "Review item was not found." } });
    return;
  }
  if (item.status !== ReviewStatus.PENDING) {
    res.status(409).json({ error: { code: "REVIEW_ITEM_ALREADY_RESOLVED", message: "Review item has already been resolved." } });
    return;
  }
  const proposed = proposedTransactionSchema.safeParse(item.proposedData);
  if (!proposed.success) {
    res.status(400).json({ error: { code: "REVIEW_ITEM_INVALID", message: "This row has no valid proposed transaction." } });
    return;
  }

  const rawCurrency = item.rawData && typeof item.rawData === "object" && !Array.isArray(item.rawData) ? (item.rawData as { currency?: string }).currency : undefined;
  const sourceCurrency = proposed.data.currency ?? rawCurrency ?? "USD";
  if (proposed.data.categoryId) {
    const category = await prisma.category.findFirst({ where: { id: proposed.data.categoryId, ownerClerkId, isArchived: false }, select: { id: true } });
    if (!category) {
      res.status(400).json({ error: { code: "INVALID_CATEGORY", message: "The suggested category is not available." } });
      return;
    }
  }
  const result = await prisma.$transaction(async (tx) => {
    if (item.fingerprint) {
      const duplicate = await tx.transaction.findFirst({ where: { ownerClerkId, fingerprint: item.fingerprint } });
      if (duplicate) return { duplicate: true as const };
    }
    const transactionData: Prisma.TransactionUncheckedCreateInput = {
      ownerClerkId,
      type: proposed.data.type,
      amount: proposed.data.amount,
      currency: sourceCurrency,
      categoryId: proposed.data.categoryId,
      description: proposed.data.description,
      merchant: proposed.data.merchant,
      occurredAt: proposed.data.occurredAt,
      fingerprint: item.fingerprint,
      source: "csv",
      needsReview: false,
    };
    const transaction = await tx.transaction.create({ data: transactionData });
    await tx.transactionReviewItem.update({ where: { id: item.id }, data: { status: ReviewStatus.APPROVED } });
    return { transaction };
  });

  if ("duplicate" in result && result.duplicate) {
    res.status(409).json({ error: { code: "DUPLICATE_TRANSACTION", message: "A transaction with this fingerprint already exists." } });
    return;
  }
  res.json({ data: result.transaction });
});

reviewsRouter.post("/:id/reject", async (req, res) => {
  const item = await prisma.transactionReviewItem.updateMany({
    where: { id: req.params.id, ownerClerkId: req.auth!.userId, status: ReviewStatus.PENDING },
    data: { status: ReviewStatus.REJECTED },
  });
  if (item.count === 0) {
    res.status(404).json({ error: { code: "REVIEW_ITEM_NOT_FOUND", message: "Pending review item was not found." } });
    return;
  }
  res.status(204).send();
});
