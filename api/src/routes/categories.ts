import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

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

categoriesRouter.post("/", async (req, res) => {
  const input = categorySchema.parse(req.body);
  const category = await prisma.category.create({
    data: { ...input, ownerClerkId: req.auth!.userId },
  });
  res.status(201).json({ data: category });
});

function isProtectedDefault(name: string): boolean {
  return name.trim().toLowerCase() === "other";
}

async function forbidProtectedDefault(ownerClerkId: string, id: string): Promise<string | null> {
  const existing = await prisma.category.findFirst({ where: { id, ownerClerkId }, select: { name: true } });
  if (!existing) return null;
  if (isProtectedDefault(existing.name)) {
    return "The default Other category cannot be archived or deleted because uncategorized transactions fall back to it.";
  }
  return null;
}

categoriesRouter.patch("/:id", async (req, res) => {
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
