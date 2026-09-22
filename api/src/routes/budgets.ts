import { BudgetType, Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../middleware/errors.js";
import { requireAuth } from "../middleware/auth.js";

export const budgetsRouter = Router();
budgetsRouter.use(requireAuth);

const budgetSchema = z.object({
  categoryId: z.string().trim().min(1),
  type: z.nativeEnum(BudgetType),
  value: z.coerce.number().finite().nonnegative(),
  isExcluded: z.boolean().optional(),
});

const budgetUpdateSchema = budgetSchema.partial();

async function assertCategory(ownerClerkId: string, categoryId: string) {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, ownerClerkId, isArchived: false },
  });
  if (!category) {
    throw new AppError(400, "Category was not found or is archived.", "INVALID_CATEGORY");
  }
}

function validateValue(type: BudgetType, value: number) {
  if (type === BudgetType.PERCENTAGE && value > 100) {
    throw new AppError(400, "Percentage budgets must be between 0 and 100.", "INVALID_BUDGET_VALUE");
  }
}

budgetsRouter.get("/", async (req, res) => {
  const budgets = await prisma.budget.findMany({
    where: { ownerClerkId: req.auth!.userId },
    include: { category: true },
    orderBy: [{ isExcluded: "asc" }, { category: { name: "asc" } }],
  });
  res.json({ data: budgets });
});

budgetsRouter.post("/", async (req, res) => {
  const input = budgetSchema.parse(req.body);
  const ownerClerkId = req.auth!.userId;
  validateValue(input.type, input.value);
  await assertCategory(ownerClerkId, input.categoryId);

  const existing = await prisma.budget.findFirst({ where: { ownerClerkId, categoryId: input.categoryId } });
  if (existing) {
    throw new AppError(409, "A budget already exists for this category.", "BUDGET_ALREADY_EXISTS");
  }

  const budget = await prisma.budget.create({
    data: {
      ...input,
      ownerClerkId,
      value: new Prisma.Decimal(input.value),
    },
    include: { category: true },
  });
  res.status(201).json({ data: budget });
});

budgetsRouter.get("/:id", async (req, res) => {
  const budget = await prisma.budget.findFirst({
    where: { id: req.params.id, ownerClerkId: req.auth!.userId },
    include: { category: true },
  });
  if (!budget) {
    res.status(404).json({ error: { code: "BUDGET_NOT_FOUND", message: "Budget was not found." } });
    return;
  }
  res.json({ data: budget });
});

budgetsRouter.patch("/:id", async (req, res) => {
  const input = budgetUpdateSchema.parse(req.body);
  const ownerClerkId = req.auth!.userId;
  const existing = await prisma.budget.findFirst({ where: { id: req.params.id, ownerClerkId } });
  if (!existing) {
    res.status(404).json({ error: { code: "BUDGET_NOT_FOUND", message: "Budget was not found." } });
    return;
  }

  const type = input.type ?? existing.type;
  const value = input.value ?? Number(existing.value);
  validateValue(type, value);
  if (input.categoryId) await assertCategory(ownerClerkId, input.categoryId);
  if (input.categoryId && input.categoryId !== existing.categoryId) {
    const duplicate = await prisma.budget.findFirst({
      where: { ownerClerkId, categoryId: input.categoryId, id: { not: existing.id } },
    });
    if (duplicate) throw new AppError(409, "A budget already exists for this category.", "BUDGET_ALREADY_EXISTS");
  }

  const budget = await prisma.budget.update({
    where: { id: existing.id },
    data: {
      ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      ...(input.type ? { type: input.type } : {}),
      ...(input.value !== undefined ? { value: new Prisma.Decimal(input.value) } : {}),
      ...(input.isExcluded !== undefined ? { isExcluded: input.isExcluded } : {}),
    },
    include: { category: true },
  });
  res.json({ data: budget });
});

budgetsRouter.delete("/:id", async (req, res) => {
  const result = await prisma.budget.deleteMany({ where: { id: req.params.id, ownerClerkId: req.auth!.userId } });
  if (result.count === 0) {
    res.status(404).json({ error: { code: "BUDGET_NOT_FOUND", message: "Budget was not found." } });
    return;
  }
  res.status(204).send();
});
