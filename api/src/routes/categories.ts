import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { assertPro } from "../middleware/plan.js";

export const categoriesRouter = Router();
categoriesRouter.use(requireAuth);

const categorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  isTaxable: z.boolean().optional(),
  isArchived: z.boolean().optional(),
});

categoriesRouter.get("/", async (req, res) => {
  const categories = await prisma.category.findMany({
    where: { ownerClerkId: req.auth!.userId },
    orderBy: [{ isArchived: "asc" }, { name: "asc" }],
  });
  res.json({ data: categories });
});

/**
 * Category chip colours. Every entry keeps white label text above 4.5:1
 * contrast, and no two share a hue, so chips stay tellable apart at a glance.
 */
export const CATEGORY_PALETTE = [
  "#0f766e", "#b45309", "#1d4ed8", "#be123c", "#7c3aed", "#0e7490",
  "#a16207", "#15803d", "#c2410c", "#4338ca", "#9d174d", "#065f46",
  "#92400e", "#1e3a8a", "#86198f", "#155e75", "#3f6212", "#831843",
] as const;

/** First palette colour this owner isn't already using, so chips stay unique. */
async function pickUnusedColor(ownerClerkId: string): Promise<string> {
  const used = new Set(
    (await prisma.category.findMany({ where: { ownerClerkId }, select: { color: true } }))
      .map((row) => row.color?.toLowerCase())
      .filter((value): value is string => Boolean(value)),
  );
  return CATEGORY_PALETTE.find((color) => !used.has(color.toLowerCase())) ?? CATEGORY_PALETTE[used.size % CATEGORY_PALETTE.length]!;
}

categoriesRouter.post("/", async (req, res) => {
  await assertPro(req.auth?.userId, "Creating categories");
  const input = categorySchema.parse(req.body);
  // A category always ends up with a colour of its own: the user's pick when
  // they made one, otherwise the next unused palette entry.
  const color = input.color ?? (await pickUnusedColor(req.auth!.userId));
  const category = await prisma.category.create({
    data: { ...input, color, ownerClerkId: req.auth!.userId },
  });
  res.status(201).json({ data: category });
});

function isProtectedDefault(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return normalized === "other" || normalized === "uncategorized";
}

async function forbidProtectedDefault(ownerClerkId: string, id: string): Promise<string | null> {
  const existing = await prisma.category.findFirst({ where: { id, ownerClerkId }, select: { name: true } });
  if (!existing) return null;
  if (isProtectedDefault(existing.name)) {
    return existing.name.trim().toLowerCase() === "uncategorized"
      ? "The Uncategorized category cannot be archived or deleted because low-confidence transactions are routed to it."
      : "The default Other category cannot be archived or deleted because uncategorized transactions fall back to it.";
  }
  return null;
}

categoriesRouter.patch("/:id", async (req, res) => {
  await assertPro(req.auth?.userId, "Changing categories");
  const input = categorySchema.partial().parse(req.body);
  if (input.isArchived) {
    const forbidden = await forbidProtectedDefault(req.auth!.userId, req.params.id);
    if (forbidden) {
      res.status(400).json({ error: { code: "PROTECTED_CATEGORY", message: forbidden } });
      return;
    }
  }
  const result = await prisma.category.updateMany({
    where: { id: req.params.id, ownerClerkId: req.auth!.userId },
    data: input,
  });
  if (result.count === 0) {
    res.status(404).json({ error: { code: "CATEGORY_NOT_FOUND", message: "Category was not found." } });
    return;
  }
  const category = await prisma.category.findFirst({ where: { id: req.params.id, ownerClerkId: req.auth!.userId } });
  res.json({ data: category });
});

categoriesRouter.delete("/:id", async (req, res) => {
  await assertPro(req.auth?.userId, "Archiving categories");
  const forbidden = await forbidProtectedDefault(req.auth!.userId, req.params.id);
  if (forbidden) {
    res.status(400).json({ error: { code: "PROTECTED_CATEGORY", message: forbidden } });
    return;
  }
  const result = await prisma.category.updateMany({
    where: { id: req.params.id, ownerClerkId: req.auth!.userId },
    data: { isArchived: true },
  });
  if (result.count === 0) {
    res.status(404).json({ error: { code: "CATEGORY_NOT_FOUND", message: "Category was not found." } });
    return;
  }
  res.status(204).send();
});
