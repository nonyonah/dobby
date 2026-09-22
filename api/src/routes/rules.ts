import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const rulesRouter = Router();
rulesRouter.use(requireAuth);

const ruleSchema = z.object({
  matcher: z.string().trim().min(1).max(120),
  categoryId: z.string().trim().min(1).nullable().optional(),
  isTaxable: z.boolean().optional(),
});

async function validCategory(ownerClerkId: string, categoryId?: string | null) {
  if (!categoryId) return true;
  return Boolean(await prisma.category.findFirst({ where: { id: categoryId, ownerClerkId, isArchived: false } }));
}

rulesRouter.get("/", async (req, res) => {
  const rules = await prisma.categorizationRule.findMany({
    where: { ownerClerkId: req.auth!.userId },
    include: { category: true },
    orderBy: { createdAt: "asc" },
  });
  res.json({ data: rules });
});

rulesRouter.post("/", async (req, res) => {
  const input = ruleSchema.parse(req.body);
  const ownerClerkId = req.auth!.userId;
  if (!(await validCategory(ownerClerkId, input.categoryId))) {
    res.status(400).json({ error: { code: "INVALID_CATEGORY", message: "Category was not found or is archived." } });
    return;
  }
  const rule = await prisma.categorizationRule.create({ data: { ...input, ownerClerkId }, include: { category: true } });
  res.status(201).json({ data: rule });
});

rulesRouter.patch("/:id", async (req, res) => {
  const input = ruleSchema.partial().parse(req.body);
  const ownerClerkId = req.auth!.userId;
  if (!(await validCategory(ownerClerkId, input.categoryId))) {
    res.status(400).json({ error: { code: "INVALID_CATEGORY", message: "Category was not found or is archived." } });
    return;
  }
  const updated = await prisma.categorizationRule.updateMany({ where: { id: req.params.id, ownerClerkId }, data: input });
  if (!updated.count) {
    res.status(404).json({ error: { code: "RULE_NOT_FOUND", message: "Categorization rule was not found." } });
    return;
  }
  const rule = await prisma.categorizationRule.findFirst({ where: { id: req.params.id, ownerClerkId }, include: { category: true } });
  res.json({ data: rule });
});

rulesRouter.delete("/:id", async (req, res) => {
  const deleted = await prisma.categorizationRule.deleteMany({ where: { id: req.params.id, ownerClerkId: req.auth!.userId } });
  if (!deleted.count) {
    res.status(404).json({ error: { code: "RULE_NOT_FOUND", message: "Categorization rule was not found." } });
    return;
  }
  res.status(204).send();
});

rulesRouter.post("/reapply", async (req, res) => {
  const ownerClerkId = req.auth!.userId;
  const [rules, transactions] = await prisma.$transaction([
    prisma.categorizationRule.findMany({ where: { ownerClerkId }, orderBy: { matcher: "asc" } }),
    prisma.transaction.findMany({ where: { ownerClerkId }, select: { id: true, description: true, merchant: true } }),
  ]);
  let updatedCount = 0;
  for (const transaction of transactions) {
    const text = `${transaction.merchant ?? ""} ${transaction.description}`.toLowerCase();
    const match = rules.find((rule) => text.includes(rule.matcher.toLowerCase()));
    if (!match) continue;
    await prisma.transaction.update({ where: { id: transaction.id }, data: { categoryId: match.categoryId, isTaxable: match.isTaxable } });
    updatedCount += 1;
  }
  res.json({ data: { updatedCount } });
});
