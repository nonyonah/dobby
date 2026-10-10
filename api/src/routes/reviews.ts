import { AccountType, Prisma, ReviewStatus, TransactionType } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { getConversionFactors } from "../providers/frankfurter.js";
import { settleImportsFor } from "../imports/pipeline.js";
import { runExclusive } from "../lib/user-mutex.js";

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
  /**
   * Transfer verdict. A suggestion the user may disagree with, so the source
   * travels with it and the row stays overridable.
   */
  transferSource: z.enum(["reference", "pattern", "name"]).optional(),
  /** Which way this leg went. Without it both legs look identical. */
  transferDirection: z.enum(["IN", "OUT"]).optional(),
  /** The statement section this row belongs to, used to resolve its account. */
  subAccount: z.string().trim().min(1).max(60).optional(),
  reference: z.string().trim().min(1).max(80).optional(),
  /** Derived from the country's tax module, never asked of the model. */
  taxTreatment: z.enum(["taxable", "not_taxable", "ask"]).optional(),
  /** Absent on expense and transfer rows, which carry no taxable value. */
  isTaxable: z.boolean().nullable().optional(),
  taxableSource: z.enum(["rule", "user"]).optional(),
});

const listSchema = z.object({
  status: z.nativeEnum(ReviewStatus).optional(),
  /** Last row of the previous page. Keyset pagination, not offset. */
  cursor: z.string().min(1).optional(),
  take: z.coerce.number().int().min(1).max(500).default(200),
});

reviewsRouter.get("/", async (req, res) => {
  const { status, cursor, take } = listSchema.parse(req.query);
  const where = { ownerClerkId: req.auth!.userId, ...(status ? { status } : {}) };
  const items = await prisma.transactionReviewItem.findMany({
    where,
    // `id` breaks ties. A statement lands hundreds of rows in one createMany,
    // so ordering on createdAt alone leaves the page boundary ambiguous between
    // rows sharing a timestamp — which drops or repeats rows as the user pages.
    orderBy: [{ status: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    take,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { import: { select: { id: true, originalName: true, status: true } } },
  });
  // The size of the queue this page is a slice of. Without it the client cannot
  // tell an exhausted queue from a truncated one, which is how a queue of 200+
  // rows came to look like a queue of 200 and left the rest uneditable.
  const total = await prisma.transactionReviewItem.count({ where });
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
    // `needsPassword` was written by the extractor and then read by nobody, so
    // the client had to infer "locked" from the wording of an error message.
    // Surfaced as a real flag, the UI can decide what to show and what to hide
    // without depending on prose staying put.
    const raw = item.rawData && typeof item.rawData === "object" && !Array.isArray(item.rawData)
      ? item.rawData as { needsPassword?: boolean }
      : undefined;
    const proposal = item.proposedData && typeof item.proposedData === "object" && !Array.isArray(item.proposedData)
      ? item.proposedData as { taxTreatment?: string; needsTaxAnswer?: boolean; transferSource?: string; transferDirection?: string; subAccount?: string }
      : undefined;
    return {
      ...item,
      displayAmount,
      displayCurrency: activeCurrency,
      sourceCurrency,
      needsPassword: raw?.needsPassword === true,
      // Derived, not asked of the model: the row carries its own open question.
      needsTaxAnswer: proposal?.needsTaxAnswer === true && proposal.taxTreatment === "ask",
      transferSource: proposal?.transferSource,
      transferDirection: proposal?.transferDirection,
      subAccount: proposal?.subAccount,
    };
  });
  res.json({ data, total });
});

/**
 * `isTaxable` is accepted here because an inflow the rules could not resolve
 * arrives in the review queue as one question ("was this income, a gift, or a
 * loan?"). The user answers it while approving, rather than approving a
 * coin-flip and discovering it later in the tax summary.
 */
type ApproveInput = { id: string; categoryId?: string | null; isTaxable?: boolean | null };
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
  // Imports whose items this call touched, settled once at the end so the
  // single-approve and bulk-approve paths behave the same.
  const touched = new Set<string>();
  for (const input of inputs) {
    const item = byId.get(input.id);
    if (item) touched.add(item.importId);
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
    // A transfer is not categorised. Both legs are TRANSFER by type, and giving
    // one a spend category would put it straight back into the expense totals
    // that transfer detection exists to keep it out of.
    const categoryId = proposed.data.type === TransactionType.TRANSFER ? undefined : input.categoryId ?? proposed.data.categoryId;
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
      // One account per statement section. A statement that prints a Wallet
      // table and a Savings table is two accounts, and filing the Savings
      // movement under Wallet is how a transfer quietly becomes a withdrawal
      // from money the user does not have.
      const section = item.subAccount ?? proposed.data.subAccount;
      const accountId = section
        ? await accountIdForSection(ownerClerkId, section, sourceCurrency)
        : undefined;
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
        // Section label and bank reference have to survive approval. Without
        // them a row loses which account it belonged to and can never be paired
        // as half of a transfer.
        ...(accountId ? { accountId } : {}),
        ...(section ? { subAccount: section } : {}),
        ...(item.reference ?? proposed.data.reference ? { reference: item.reference ?? proposed.data.reference } : {}),
        ...(proposed.data.transferSource ? { transferSource: proposed.data.transferSource } : {}),
        ...(proposed.data.transferDirection ? { transferDirection: proposed.data.transferDirection } : {}),
        ...(proposed.data.taxTreatment ? { taxTreatment: proposed.data.taxTreatment } : {}),
        // An explicit answer from the user wins over anything derived: it is
        // recorded as theirs, so no later rule pass can silently overturn it.
        ...(input.isTaxable !== undefined
          ? { isTaxable: input.isTaxable, taxableSource: "user" as const, taxTreatment: input.isTaxable ? "taxable" as const : "not_taxable" as const }
          : proposed.data.isTaxable !== undefined
            ? { isTaxable: proposed.data.isTaxable, taxableSource: proposed.data.taxableSource ?? "rule" }
            : {}),
      };
      await prisma.transaction.create({ data: transactionData });
      await prisma.transactionReviewItem.update({ where: { id: item.id }, data: { status: ReviewStatus.APPROVED } });
      results.push({ id: input.id, ok: true, duplicate: false });
    } catch (error) {
      results.push({ id: input.id, ok: false, code: "APPROVE_FAILED", message: error instanceof Error ? error.message : "Could not approve this transaction." });
    }
  }
  await settleImportsFor(touched);
  return results;
}

/** Section label -> account id, cached for the life of one request. */
const sectionAccounts = new Map<string, string>();

/**
 * Resolves a statement's account heading to a real Account, creating it once.
 *
 * Cached across the batch so a fourteen-row Wallet section creates one account
 * rather than fourteen. The lookup is name-scoped to the owner and the
 * currency, so importing a statement in naira cannot silently reuse a dollar
 * account of the same name.
 */
async function accountIdForSection(ownerClerkId: string, section: string, currency: string): Promise<string | undefined> {
  const name = section.trim();
  if (!name) return undefined;
  const key = `${name.toLowerCase()}|${currency.toLowerCase()}`;
  const cached = sectionAccounts.get(key);
  if (cached) return cached;

  const existing = await prisma.account.findFirst({ where: { ownerClerkId, name: { equals: name, mode: "insensitive" } }, select: { id: true } });
  const account = existing ?? await prisma.account.create({
    data: { ownerClerkId, name, type: accountTypeForSection(name), currency },
    select: { id: true },
  });
  sectionAccounts.set(key, account.id);
  return account.id;
}

/** Best guess at what kind of account a heading names. */
function accountTypeForSection(name: string): AccountType {
  const text = name.toLowerCase();
  if (/saving|investment|oreach|owealth|fixed/.test(text)) return AccountType.INVESTMENT;
  if (/cash/.test(text)) return AccountType.CASH;
  if (/card|credit/.test(text)) return AccountType.CREDIT_CARD;
  if (/wallet/.test(text)) return AccountType.WALLET;
  return AccountType.BANK;
}

reviewsRouter.post("/approve-many", async (req, res) => {
  const input = z
    .object({ items: z.array(z.object({ id: z.string().min(1), categoryId: z.string().trim().min(1).max(80).nullable().optional(), isTaxable: z.boolean().nullable().optional() })).min(1).max(200) })
    .parse(req.body);
  const ownerClerkId = req.auth!.userId;
  const results = await runExclusive(`reviews-approve:${ownerClerkId}`, () => approveReviewItems(ownerClerkId, input.items));
  const approved = results.filter((result) => result.ok && !result.duplicate).map((result) => result.id);
  const duplicates = results.filter((result) => result.ok && result.duplicate).map((result) => result.id);
  const failed = results.filter((result) => !result.ok);
  res.json({ data: { results, approved, duplicates, failed } });
});

reviewsRouter.post("/:id/approve", async (req, res) => {
  const ownerClerkId = req.auth!.userId;
  const override = z.object({
    categoryId: z.string().trim().min(1).max(80).nullable().optional(),
    isTaxable: z.boolean().nullable().optional(),
  }).parse(req.body);
  const [result] = await runExclusive(`reviews-approve:${ownerClerkId}`, () =>
    approveReviewItems(ownerClerkId, [{ id: req.params.id, categoryId: override.categoryId, isTaxable: override.isTaxable }]),
  );
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
  // Read the parent first: updateMany below returns a count, not the row, and
  // the import has to be settled once this is the last pending item in it.
  const target = await prisma.transactionReviewItem.findFirst({
    where: { id: req.params.id, ownerClerkId: req.auth!.userId },
    select: { importId: true },
  });
  const item = await prisma.transactionReviewItem.updateMany({
    where: { id: req.params.id, ownerClerkId: req.auth!.userId, status: ReviewStatus.PENDING },
    data: { status: ReviewStatus.REJECTED },
  });
  if (item.count === 0) {
    res.status(404).json({ error: { code: "REVIEW_ITEM_NOT_FOUND", message: "Pending review item was not found." } });
    return;
  }
  if (target) await settleImportsFor([target.importId]);
  res.status(204).send();
});
