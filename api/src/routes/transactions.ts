import { Prisma, TransactionType } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

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
  isRecurring: z.boolean().optional(),
  isTaxable: z.boolean().optional(),
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
  const [items, total] = await prisma.$transaction([
    prisma.transaction.findMany({
      where,
      include: { account: true, category: true },
      orderBy: { [filters.sort]: filters.direction },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    prisma.transaction.count({ where }),
  ]);

  res.json({ data: items, meta: { page: filters.page, pageSize: filters.pageSize, total, pageCount: Math.ceil(total / filters.pageSize) } });
});

transactionsRouter.post("/", async (req, res) => {
  const input = transactionSchema.parse(req.body);
  const ownerClerkId = req.auth!.userId;
  const relationError = await assertRelations(ownerClerkId, input.accountId, input.categoryId);
  if (relationError) {
    res.status(400).json({ error: { code: "INVALID_RELATION", message: relationError } });
    return;
  }
  const createData: Prisma.TransactionUncheckedCreateInput = {
    ...input,
    ownerClerkId,
    amount: input.amount,
    metadata: input.metadata === null ? Prisma.JsonNull : (input.metadata as Prisma.InputJsonValue | undefined),
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
  const updateData: Prisma.TransactionUncheckedUpdateInput = {
    ...input,
    metadata: input.metadata === null ? Prisma.JsonNull : (input.metadata as Prisma.InputJsonValue | undefined),
  };
  const transaction = await prisma.transaction.update({
    where: { id: existing.id },
    data: updateData,
    include: { account: true, category: true },
  });
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
