import { GoalStatus, Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../middleware/errors.js";
import { requireAuth } from "../middleware/auth.js";

export const goalsRouter = Router();
goalsRouter.use(requireAuth);

const goalSchema = z.object({
  name: z.string().trim().min(1).max(120),
  targetAmount: z.coerce.number().finite().positive(),
  currency: z.string().trim().length(3).toUpperCase().optional(),
  deadline: z.coerce.date().nullable().optional(),
});

const contributionSchema = z.object({
  amount: z.coerce.number().finite().positive(),
  contributedAt: z.coerce.date().optional(),
  note: z.string().trim().max(240).nullable().optional(),
});

function withProgress<T extends { contributions: Array<{ amount: Prisma.Decimal }> }>(goal: T) {
  const currentAmount = goal.contributions.reduce((total, contribution) => total.plus(contribution.amount), new Prisma.Decimal(0));
  const { contributions, ...data } = goal;
  return { ...data, currentAmount, contributions };
}

async function findGoal(ownerClerkId: string, id: string) {
  return prisma.goal.findFirst({
    where: { id, ownerClerkId },
    include: { contributions: { orderBy: { contributedAt: "desc" } } },
  });
}

async function requireGoal(ownerClerkId: string, id: string) {
  const goal = await findGoal(ownerClerkId, id);
  if (!goal) throw new AppError(404, "Goal was not found.", "GOAL_NOT_FOUND");
  return goal;
}

goalsRouter.get("/", async (req, res) => {
  const status = z.nativeEnum(GoalStatus).optional().parse(req.query.status);
  const goals = await prisma.goal.findMany({
    where: { ownerClerkId: req.auth!.userId, ...(status ? { status } : {}) },
    include: { contributions: true },
    orderBy: [{ status: "asc" }, { deadline: "asc" }, { createdAt: "desc" }],
  });
  res.json({ data: goals.map(withProgress) });
});

goalsRouter.post("/", async (req, res) => {
  const input = goalSchema.parse(req.body);
  const goal = await prisma.goal.create({
    data: {
      ...input,
      ownerClerkId: req.auth!.userId,
      targetAmount: new Prisma.Decimal(input.targetAmount),
    },
    include: { contributions: true },
  });
  res.status(201).json({ data: withProgress(goal) });
});

goalsRouter.get("/:id", async (req, res) => {
  const goal = await requireGoal(req.auth!.userId, req.params.id);
  res.json({ data: withProgress(goal) });
});

goalsRouter.patch("/:id", async (req, res) => {
  const input = goalSchema.partial().parse(req.body);
  await requireGoal(req.auth!.userId, req.params.id);
  const goal = await prisma.goal.update({
    where: { id: req.params.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.targetAmount !== undefined ? { targetAmount: new Prisma.Decimal(input.targetAmount) } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.deadline !== undefined ? { deadline: input.deadline } : {}),
    },
    include: { contributions: { orderBy: { contributedAt: "desc" } } },
  });
  res.json({ data: withProgress(goal) });
});

goalsRouter.post("/:id/contributions", async (req, res) => {
  const input = contributionSchema.parse(req.body);
  const ownerClerkId = req.auth!.userId;
  await requireGoal(ownerClerkId, req.params.id);
  const contribution = await prisma.goalContribution.create({
    data: {
      ...input,
      ownerClerkId,
      goalId: req.params.id,
      amount: new Prisma.Decimal(input.amount),
    },
  });
  const goal = await requireGoal(ownerClerkId, req.params.id);
  res.status(201).json({ data: { contribution, goal: withProgress(goal) } });
});

goalsRouter.get("/:id/contributions", async (req, res) => {
  const ownerClerkId = req.auth!.userId;
  await requireGoal(ownerClerkId, req.params.id);
  const contributions = await prisma.goalContribution.findMany({
    where: { goalId: req.params.id, ownerClerkId },
    orderBy: { contributedAt: "desc" },
  });
  res.json({ data: contributions });
});

goalsRouter.delete("/:id/contributions/:contributionId", async (req, res) => {
  const result = await prisma.goalContribution.deleteMany({
    where: { id: req.params.contributionId, goalId: req.params.id, ownerClerkId: req.auth!.userId },
  });
  if (result.count === 0) {
    res.status(404).json({ error: { code: "CONTRIBUTION_NOT_FOUND", message: "Contribution was not found." } });
    return;
  }
  res.status(204).send();
});

goalsRouter.post("/:id/archive", async (req, res) => {
  const result = await prisma.goal.updateMany({
    where: { id: req.params.id, ownerClerkId: req.auth!.userId },
    data: { status: GoalStatus.ARCHIVED, archivedAt: new Date() },
  });
  if (result.count === 0) {
    res.status(404).json({ error: { code: "GOAL_NOT_FOUND", message: "Goal was not found." } });
    return;
  }
  const goal = await requireGoal(req.auth!.userId, req.params.id);
  res.json({ data: withProgress(goal) });
});

goalsRouter.post("/:id/reactivate", async (req, res) => {
  const result = await prisma.goal.updateMany({
    where: { id: req.params.id, ownerClerkId: req.auth!.userId },
    data: { status: GoalStatus.ACTIVE, archivedAt: null },
  });
  if (result.count === 0) {
    res.status(404).json({ error: { code: "GOAL_NOT_FOUND", message: "Goal was not found." } });
    return;
  }
  const goal = await requireGoal(req.auth!.userId, req.params.id);
  res.json({ data: withProgress(goal) });
});

goalsRouter.delete("/:id", async (req, res) => {
  const result = await prisma.goal.updateMany({
    where: { id: req.params.id, ownerClerkId: req.auth!.userId },
    data: { status: GoalStatus.ARCHIVED, archivedAt: new Date() },
  });
  if (result.count === 0) {
    res.status(404).json({ error: { code: "GOAL_NOT_FOUND", message: "Goal was not found." } });
    return;
  }
  res.status(204).send();
});
