import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { computeEffectivePlan, trialEndsAt } from "../middleware/plan.js";

export const meRouter = Router();

const profileUpdateSchema = z.object({
  currency: z.string().trim().length(3).toUpperCase().optional(),
  country: z.string().trim().min(2).max(2).toUpperCase().nullable().optional(),
  taxJurisdiction: z.string().trim().max(64).nullable().optional(),
  theme: z.enum(["light", "dark", "system"]).nullable().optional(),
  accentColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  onboarded: z.literal(true).optional(),
});

meRouter.use(requireAuth);

meRouter.get("/", async (req, res) => {
  const clerkId = req.auth!.userId;
  const [user, categoryCount] = await Promise.all([
    prisma.user.upsert({
      where: { clerkId },
      create: {
        clerkId,
        profile: { create: {} },
      },
      update: {},
      include: { profile: true },
    }),
    prisma.category.count({ where: { ownerClerkId: clerkId } }),
  ]);
  if (categoryCount === 0) {
    await prisma.category.createMany({
      data: ["Housing", "Groceries", "Utilities", "Transport", "Dining", "Shopping", "Education", "Income", "Investments", "Other"].map((name) => ({ ownerClerkId: clerkId, name })),
      skipDuplicates: true,
    });
  }

  // Report the plan as the trial clock resolves it, and persist EXPIRED the
  // first time a lapsed trial is seen so the stored enum catches up.
  const effective = computeEffectivePlan(user);
  if (effective === "EXPIRED" && user.plan !== "EXPIRED") {
    await prisma.user.update({ where: { clerkId }, data: { plan: "EXPIRED" } }).catch(() => undefined);
  }

  res.json({ data: { ...user, plan: effective, trialEndsAt: trialEndsAt(user) } });
});

meRouter.patch("/", async (req, res) => {
  const clerkId = req.auth!.userId;
  const input = profileUpdateSchema.parse(req.body);

  // Nested under `user.upsert`, so the relation scalar (clerkId) is set by
  // Prisma from the parent — passing it explicitly fails validation.
  const profileCreate: Prisma.ProfileCreateWithoutUserInput = {};
  const profileUpdate: Prisma.ProfileUpdateWithoutUserInput = {};
  if (input.currency !== undefined) { profileCreate.currency = input.currency; profileUpdate.currency = input.currency; }
  if (input.country !== undefined) { profileCreate.country = input.country; profileUpdate.country = input.country; }
  if (input.taxJurisdiction !== undefined) { profileCreate.taxJurisdiction = input.taxJurisdiction; profileUpdate.taxJurisdiction = input.taxJurisdiction; }
  if (input.theme !== undefined) { profileCreate.theme = input.theme; profileUpdate.theme = input.theme; }
  if (input.accentColor !== undefined) { profileCreate.accentColor = input.accentColor; profileUpdate.accentColor = input.accentColor; }

  const userCreate: Prisma.UserUncheckedCreateInput = { clerkId };
  const userUpdate: Prisma.UserUncheckedUpdateInput = {};
  if (input.firstName !== undefined) { userCreate.firstName = input.firstName; userUpdate.firstName = input.firstName; }
  if (input.lastName !== undefined) { userCreate.lastName = input.lastName; userUpdate.lastName = input.lastName; }
  if (input.onboarded) { userCreate.onboardedAt = new Date(); userUpdate.onboardedAt = new Date(); }

  const user = await prisma.user.upsert({
    where: { clerkId },
    create: {
      ...userCreate,
      profile: { create: profileCreate },
    },
    update: {
      ...userUpdate,
      profile: { upsert: { create: profileCreate, update: profileUpdate } },
    },
    include: { profile: true },
  });

  res.json({ data: user });
});
