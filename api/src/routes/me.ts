import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const meRouter = Router();

const profileUpdateSchema = z.object({
  currency: z.string().trim().length(3).toUpperCase().optional(),
  country: z.string().trim().min(2).max(2).toUpperCase().nullable().optional(),
  taxJurisdiction: z.string().trim().max(64).nullable().optional(),
  theme: z.enum(["light", "dark", "system"]).nullable().optional(),
  accentColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
});

meRouter.use(requireAuth);

meRouter.get("/", async (req, res) => {
  const clerkId = req.auth!.userId;
  const user = await prisma.user.upsert({
    where: { clerkId },
    create: {
      clerkId,
      profile: { create: {} },
    },
    update: {},
    include: { profile: true },
  });

  const categoryCount = await prisma.category.count({ where: { ownerClerkId: clerkId } });
  if (categoryCount === 0) {
    await prisma.category.createMany({
      data: ["Housing", "Groceries", "Utilities", "Transport", "Dining", "Shopping", "Education", "Income", "Investments", "Other"].map((name) => ({ ownerClerkId: clerkId, name })),
      skipDuplicates: true,
    });
  }

  res.json({ data: user });
});

meRouter.patch("/", async (req, res) => {
  const clerkId = req.auth!.userId;
  const input = profileUpdateSchema.parse(req.body);

  const user = await prisma.user.upsert({
    where: { clerkId },
    create: {
      clerkId,
      profile: { create: input },
    },
    update: {
      profile: { upsert: { create: input, update: input } },
    },
    include: { profile: true },
  });

  res.json({ data: user });
});
