import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { runExclusive } from "../lib/user-mutex.js";
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

/** Rows read per round trip while re-applying rules across the whole ledger. */
const REAPPLY_BATCH = 500;

/** Pre-lowered matchers, so a large ledger is not re-lowered per transaction. */
function compileRules(rules: Array<{ matcher: string; categoryId: string | null; isTaxable: boolean }>) {
  return rules.map((rule) => ({ ...rule, needle: rule.matcher.toLowerCase() }));
}

rulesRouter.post("/reapply", async (req, res) => {
  const ownerClerkId = req.auth!.userId;
  const updatedCount = await runExclusive(`rules-reapply:${ownerClerkId}`, async () => {
    const rules = compileRules(
      await prisma.categorizationRule.findMany({ where: { ownerClerkId }, orderBy: { matcher: "asc" } }),
    );
    if (rules.length === 0) return 0;

    // Walk the ledger with a cursor instead of loading it. A user with years of
    // history is hundreds of thousands of rows, and materialising all of them
    // to re-apply a handful of matchers is what turns this into an outage.
    // Updating only categoryId/isTaxable leaves `id` untouched, so the cursor
    // stays stable across the writes.
    let cursor: string | undefined;
    let count = 0;
    for (;;) {
      const page = await prisma.transaction.findMany({
        // `userOverridden: false` is the whole point of that flag: a row the user
        // has edited is a decision, not a guess, and re-applying a rule over it
        // is what made manual corrections appear not to stick. This endpoint
        // previously walked the entire ledger with no exclusion at all.
        where: { ownerClerkId, userOverridden: false },
        select: { id: true, description: true, merchant: true },
        orderBy: { id: "asc" },
        take: REAPPLY_BATCH,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (page.length === 0) break;

      const batches = new Map<string, { categoryId: string | null; isTaxable: boolean; ids: string[] }>();
      for (const transaction of page) {
        const text = `${transaction.merchant ?? ""} ${transaction.description}`.toLowerCase();
        const match = rules.find((rule) => text.includes(rule.needle));
        if (!match) continue;
        const key = `${match.categoryId ?? ""}|${match.isTaxable}`;
        const batch = batches.get(key) ?? { categoryId: match.categoryId, isTaxable: match.isTaxable, ids: [] };
        batch.ids.push(transaction.id);
        batches.set(key, batch);
      }
      for (const batch of batches.values()) {
        const result = await prisma.transaction.updateMany({
          where: { id: { in: batch.ids }, ownerClerkId },
          data: { categoryId: batch.categoryId, isTaxable: batch.isTaxable },
        });
        count += result.count;
      }

      if (page.length < REAPPLY_BATCH) break;
      cursor = page[page.length - 1]!.id;
    }
    return count;
  });
  res.json({ data: { updatedCount } });
});
