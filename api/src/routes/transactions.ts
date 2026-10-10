import { IncomeSource, Prisma, TransactionType } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { convertCurrencyAmount } from "../providers/frankfurter.js";
import { logger } from "../lib/logger.js";

export const transactionsRouter = Router();
transactionsRouter.use(requireAuth);

const transactionSchema = z.object({
  accountId: z.string().trim().min(1).nullable().optional(),
  categoryId: z.string().trim().min(1).nullable().optional(),
  type: z.nativeEnum(TransactionType),
  amount: z.coerce.number().finite().positive(),
  currency: z.string().trim().length(3).toUpperCase().optional(),
  description: z.string().trim().min(1).max(240),
  merchant: z.string().trim().max(160).nullable().optional(),
  occurredAt: z.coerce.date(),
  source: z.string().trim().max(80).nullable().optional(),
  assetSymbol: z.string().trim().max(32).toUpperCase().nullable().optional(),
  externalId: z.string().trim().max(160).nullable().optional(),
  fingerprint: z.string().trim().max(255).nullable().optional(),
  // Bank transaction reference. A string with no numeric coercion on purpose:
  // real references carry leading zeros, and parsing them as numbers drops
  // those zeros, which silently breaks transfer pairing on exactly the rows
  // that depend on it.
  reference: z.string().trim().max(120).nullable().optional(),
  /** Section of a multi-account statement this row came from. */
  subAccount: z.string().trim().max(80).nullable().optional(),
  isRecurring: z.boolean().optional(),
  isTaxable: z.boolean().nullable().optional(),
  // Which liability an income row attracts: UK Class 1 vs Class 4 NI, US
  // self-employment tax. Left off entirely for non-income rows.
  incomeSource: z.nativeEnum(IncomeSource).nullable().optional(),
  needsReview: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

const listSchema = z.object({
  q: z.string().trim().max(120).optional(),
  accountId: z.string().trim().optional(),
  categoryId: z.string().trim().optional(),
  type: z.nativeEnum(TransactionType).optional(),
  source: z.string().trim().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  recurring: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  taxable: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  review: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(["occurredAt", "amount", "description", "createdAt"]).default("occurredAt"),
  direction: z.enum(["asc", "desc"]).default("desc"),
});

async function assertRelations(ownerClerkId: string, accountId?: string | null, categoryId?: string | null) {
  if (accountId) {
    const account = await prisma.account.findFirst({ where: { id: accountId, ownerClerkId, isActive: true } });
    if (!account) return "Account was not found or is inactive.";
  }
  if (categoryId) {
    const category = await prisma.category.findFirst({ where: { id: categoryId, ownerClerkId, isArchived: false } });
    if (!category) return "Category was not found or is archived.";
  }
  return undefined;
}

transactionsRouter.get("/", async (req, res) => {
  const filters = listSchema.parse(req.query);
  const ownerClerkId = req.auth!.userId;
  const where = {
    ownerClerkId,
    ...(filters.q
      ? { OR: [{ description: { contains: filters.q, mode: "insensitive" as const } }, { merchant: { contains: filters.q, mode: "insensitive" as const } }] }
      : {}),
    ...(filters.accountId ? { accountId: filters.accountId } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.source ? { source: filters.source } : {}),
    ...(filters.from || filters.to ? { occurredAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } } : {}),
    ...(filters.recurring === undefined ? {} : { isRecurring: filters.recurring }),
    ...(filters.taxable === undefined ? {} : { isTaxable: filters.taxable }),
    ...(filters.review === undefined ? {} : { needsReview: filters.review }),
  };
  const profilePromise = prisma.profile.findUnique({ where: { clerkId: ownerClerkId }, select: { currency: true } });
  // Two plain reads instead of an interactive transaction: the count is only
  // used for pagination, and interactive transactions stall on the pooler
  // ("Unable to start a transaction in the given time").
  const transactionSelect = {
    id: true,
    type: true,
    amount: true,
    currency: true,
    description: true,
    merchant: true,
    occurredAt: true,
    source: true,
    assetSymbol: true,
    isRecurring: true,
    isTaxable: true,
    needsReview: true,
    // Carried so the ledger can show which statement section a row came from
    // and which way a transfer moved, rather than a bare sign.
    subAccount: true,
    reference: true,
    transferSource: true,
    transferDirection: true,
    account: { select: { name: true } },
    category: { select: { id: true, name: true, color: true } },
  } as const;
  const [rows, count, profile] = await Promise.all([
    prisma.transaction.findMany({
      where,
      select: transactionSelect,
      orderBy: { [filters.sort]: filters.direction },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    prisma.transaction.count({ where }),
    profilePromise,
  ]);
  const items = rows;
  const total = count;

  const activeCurrency = profile?.currency?.toUpperCase() ?? "USD";
  const factors = new Map<string, number>();
  await Promise.all(
    [...new Set(items.map((item) => item.currency.toUpperCase()))].map(async (code) => {
      if (code === activeCurrency) {
        factors.set(code, 1);
        return;
      }
      try {
        factors.set(code, await convertCurrencyAmount(1, code, activeCurrency));
      } catch {
        factors.set(code, 1);
      }
    }),
  );
  const displayItems = items.map((item) => ({
    ...item,
    displayAmount: Number(item.amount) * (factors.get(item.currency.toUpperCase()) ?? 1),
    displayCurrency: activeCurrency,
  }));
  res.json({ data: displayItems, meta: { page: filters.page, pageSize: filters.pageSize, total, pageCount: Math.ceil(total / filters.pageSize), displayCurrency: activeCurrency } });
});

transactionsRouter.post("/", async (req, res) => {
  const input = transactionSchema.parse(req.body);
  const ownerClerkId = req.auth!.userId;
  const relationError = await assertRelations(ownerClerkId, input.accountId, input.categoryId);
  if (relationError) {
    res.status(400).json({ error: { code: "INVALID_RELATION", message: relationError } });
    return;
  }
  const profile = await prisma.profile.findUnique({ where: { clerkId: ownerClerkId }, select: { currency: true } });
  const createData: Prisma.TransactionUncheckedCreateInput = {
    ...input,
    ownerClerkId,
    currency: input.currency ?? profile?.currency ?? "USD",
    amount: input.amount,
    metadata: input.metadata === null ? Prisma.JsonNull : (input.metadata as Prisma.InputJsonValue | undefined),
    // A source only means anything on income, so an expense carrying one is
    // ignored rather than stored as a misleading label.
    incomeSource: input.type === "INCOME" ? input.incomeSource : null,
  };
  const transaction = await prisma.transaction.create({
    data: createData,
    include: { account: true, category: true },
  });
  res.status(201).json({ data: transaction });
});

transactionsRouter.get("/:id", async (req, res) => {
  const transaction = await prisma.transaction.findFirst({
    where: { id: req.params.id, ownerClerkId: req.auth!.userId },
    include: { account: true, category: true, import: true },
  });
  if (!transaction) {
    res.status(404).json({ error: { code: "TRANSACTION_NOT_FOUND", message: "Transaction was not found." } });
    return;
  }
  res.json({ data: transaction });
});

transactionsRouter.patch("/:id", async (req, res) => {
  const input = transactionSchema.partial().parse(req.body);
  const ownerClerkId = req.auth!.userId;
  const existing = await prisma.transaction.findFirst({ where: { id: req.params.id, ownerClerkId } });
  if (!existing) {
    res.status(404).json({ error: { code: "TRANSACTION_NOT_FOUND", message: "Transaction was not found." } });
    return;
  }
  const relationError = await assertRelations(ownerClerkId, input.accountId, input.categoryId);
  if (relationError) {
    res.status(400).json({ error: { code: "INVALID_RELATION", message: relationError } });
    return;
  }
  // Any of these is the user making a decision about the row. Recording it once,
  // here, is what lets every automated pass skip the row afterwards — rules
  // re-apply was walking the whole ledger with no exclusion and silently
  // reverting manual edits.
  const DECISION_FIELDS = ["type", "categoryId", "isTaxable", "amount", "description", "subAccount", "reference"] as const;
  const isDecision = DECISION_FIELDS.some((field) => input[field] !== undefined);

  const updateData: Prisma.TransactionUncheckedUpdateInput = {
    ...input,
    metadata: input.metadata === null ? Prisma.JsonNull : (input.metadata as Prisma.InputJsonValue | undefined),
    // Only income carries a source, so switching a row to an expense clears it.
    ...(input.incomeSource !== undefined
      ? { incomeSource: (input.type ?? existing.type) === "INCOME" ? input.incomeSource : null }
      : {}),
    // A taxable value the user set outranks anything the tax module would
    // derive, so its provenance changes with it.
    ...(input.isTaxable !== undefined ? { taxableSource: "user" as const } : {}),
    ...(isDecision ? { userOverridden: true } : {}),
  };
  const transaction = await prisma.transaction.update({
    where: { id: existing.id },
    data: updateData,
    include: { account: true, category: true },
  });

  logger.info({ transactionId: transaction.id, userOverridden: isDecision }, "transaction updated by user");
  res.json({ data: transaction });
});

transactionsRouter.delete("/:id", async (req, res) => {
  const result = await prisma.transaction.deleteMany({ where: { id: req.params.id, ownerClerkId: req.auth!.userId } });
  if (result.count === 0) {
    res.status(404).json({ error: { code: "TRANSACTION_NOT_FOUND", message: "Transaction was not found." } });
    return;
  }
  res.status(204).send();
});

transactionsRouter.post("/bulk-delete", async (req, res) => {
  const input = z.object({ ids: z.array(z.string().min(1)).min(1).max(100) }).parse(req.body);
  const result = await prisma.transaction.deleteMany({ where: { id: { in: input.ids }, ownerClerkId: req.auth!.userId } });
  res.json({ data: { deletedCount: result.count } });
});
