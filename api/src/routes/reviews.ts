import { Prisma, ReviewStatus, TransactionType } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { convertCurrencyAmount, getConversionFactors } from "../providers/frankfurter.js";
import { assertPro } from "../middleware/plan.js";

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
  // One batched rate lookup for the whole page. Converting per item meant up to
  // 200 parallel upstream calls, which rate-limited the free provider and made
  // the review queue slow to open.
  const sourceCurrencyOf = (item: (typeof items)[number]) => {
    const proposed = item.proposedData && typeof item.proposedData === "object" && !Array.isArray(item.proposedData) ? item.proposedData as { currency?: string } : undefined;
    const raw = item.rawData && typeof item.rawData === "object" && !Array.isArray(item.rawData) ? item.rawData as { currency?: string } : undefined;
    return (proposed?.currency ?? raw?.currency ?? "USD").toUpperCase();
  };
  const factors = await getConversionFactors(items.map(sourceCurrencyOf), activeCurrency);
  const data = items.map((item) => {
    const proposed = item.proposedData && typeof item.proposedData === "object" && !Array.isArray(item.proposedData) ? item.proposedData as { amount?: number } : undefined;
    const sourceCurrency = sourceCurrencyOf(item);
    const sourceAmount = Number(proposed?.amount ?? 0);
    const displayAmount = sourceAmount * (factors.get(sourceCurrency) ?? 1);
    return { ...item, displayAmount, displayCurrency: activeCurrency, sourceCurrency };
  });
  res.json({ data });
});

type ApproveInput = { id: string; categoryId?: string | null };
type ApproveResult =
  | { id: string; ok: true; duplicate: boolean }
  | { id: string; ok: false; code: string; message: string };

/**
 * Approve review items sequentially in one request. Bulk approval used to fan
 * out N concurrent single-item POSTs, each holding pool connections across an
 * interactive transaction — approve-all on a real queue starved the pool.
 * Sequential writes plus one cached category lookup per id keep this flat.
 */
async function approveReviewItems(ownerClerkId: string, inputs: ApproveInput[]): Promise<ApproveResult[]> {
  const items = await prisma.transactionReviewItem.findMany({
    where: { id: { in: inputs.map((input) => input.id) }, ownerClerkId },
  });
  const byId = new Map(items.map((item) => [item.id, item]));
  const categoryCache = new Map<string, boolean>();
  const results: ApproveResult[] = [];
  for (const input of inputs) {
    const item = byId.get(input.id);
    if (!item) {
      results.push({ id: input.id, ok: false, code: "REVIEW_ITEM_NOT_FOUND", message: "Pending review item was not found." });
      continue;
    }
    if (item.status !== ReviewStatus.PENDING) {
      results.push({ id: input.id, ok: false, code: "REVIEW_ITEM_ALREADY_RESOLVED", message: "Review item has already been resolved." });
      continue;
    }
    const proposed = proposedTransactionSchema.safeParse(item.proposedData);
    if (!proposed.success) {
      results.push({ id: input.id, ok: false, code: "REVIEW_ITEM_INVALID", message: "This row has no valid proposed transaction." });
      continue;
    }
    const categoryId = input.categoryId ?? proposed.data.categoryId;
    // Everything below touches the database — one slow query must fail only
    // its own row, never abort the whole batch.
    try {
      if (categoryId) {
        let valid = categoryCache.get(categoryId);
        if (valid === undefined) {
          const category = await prisma.category.findFirst({ where: { id: categoryId, ownerClerkId, isArchived: false }, select: { id: true } });
          valid = Boolean(category);
          categoryCache.set(categoryId, valid);
        }
        if (!valid) {
          results.push({ id: input.id, ok: false, code: "INVALID_CATEGORY", message: "The chosen category is not available." });
          continue;
        }
        proposed.data.categoryId = categoryId;
      }

      const rawCurrency = item.rawData && typeof item.rawData === "object" && !Array.isArray(item.rawData) ? (item.rawData as { currency?: string }).currency : undefined;
      const sourceCurrency = proposed.data.currency ?? rawCurrency ?? "USD";
      if (item.fingerprint) {
        const duplicate = await prisma.transaction.findFirst({ where: { ownerClerkId, fingerprint: item.fingerprint }, select: { id: true } });
        if (duplicate) {
          // The transaction already exists, so there is nothing to create — but
          // the item must still be resolved. Leaving it PENDING made an approved
          // row reappear in the queue on the next fetch, which looked like the
          // approval had applied to other rows too.
          await prisma.transactionReviewItem.updateMany({
            where: { id: input.id, ownerClerkId, status: ReviewStatus.PENDING },
            data: { status: ReviewStatus.APPROVED },
          });
          results.push({ id: input.id, ok: true, duplicate: true });
          continue;
        }
      }
      const origin = await prisma.transactionImport.findFirst({ where: { id: item.importId, ownerClerkId }, select: { type: true } });
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
        source: origin?.type === "RECEIPT" ? "receipt" : "statement",
        needsReview: false,
      };
      await prisma.transaction.create({ data: transactionData });
      await prisma.transactionReviewItem.update({ where: { id: item.id }, data: { status: ReviewStatus.APPROVED } });
      results.push({ id: input.id, ok: true, duplicate: false });
    } catch (error) {
      results.push({ id: input.id, ok: false, code: "APPROVE_FAILED", message: error instanceof Error ? error.message : "Could not approve this transaction." });
    }
  }
  return results;
}

reviewsRouter.post("/approve-many", async (req, res) => {
  await assertPro(req.auth?.userId, "Approving reviewed transactions");
  const input = z
    .object({ items: z.array(z.object({ id: z.string().min(1), categoryId: z.string().trim().min(1).max(80).nullable().optional() })).min(1).max(200) })
    .parse(req.body);
  const results = await approveReviewItems(req.auth!.userId, input.items);
  const approved = results.filter((result) => result.ok && !result.duplicate).map((result) => result.id);
  const duplicates = results.filter((result) => result.ok && result.duplicate).map((result) => result.id);
  const failed = results.filter((result) => !result.ok);
  res.json({ data: { results, approved, duplicates, failed } });
});

reviewsRouter.post("/:id/approve", async (req, res) => {
  await assertPro(req.auth?.userId, "Approving reviewed transactions");
  const ownerClerkId = req.auth!.userId;
  const override = z.object({ categoryId: z.string().trim().min(1).max(80).nullable().optional() }).parse(req.body);
  const [result] = await approveReviewItems(ownerClerkId, [{ id: req.params.id, categoryId: override.categoryId }]);
  if (!result || !result.ok) {
    const code = result && !result.ok ? result.code : "REVIEW_ITEM_NOT_FOUND";
    const message = result && !result.ok ? result.message : "Review item was not found.";
    const status = code === "REVIEW_ITEM_NOT_FOUND" ? 404 : code === "REVIEW_ITEM_ALREADY_RESOLVED" ? 409 : 400;
    res.status(status).json({ error: { code, message } });
    return;
  }
  if (result.duplicate) {
    res.status(409).json({ error: { code: "DUPLICATE_TRANSACTION", message: "A transaction with this fingerprint already exists." } });
    return;
  }
  res.json({ data: { approvedId: result.id } });
});

reviewsRouter.post("/:id/reject", async (req, res) => {
  await assertPro(req.auth?.userId, "Resolving reviewed transactions");
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
