import { GoalStatus, Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../middleware/errors.js";
import { requireAuth } from "../middleware/auth.js";

export const goalsRouter = Router();
goalsRouter.use(requireAuth);

const RECENT_CONTRIBUTIONS = 50;

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

const contributionListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

function withProgress<T extends { contributions: Array<{ amount: Prisma.Decimal }> }>(
  goal: T,
  totalAmount?: Prisma.Decimal | null,
) {
  const currentAmount =
    totalAmount ??
    goal.contributions.reduce((total, contribution) => total.plus(contribution.amount), new Prisma.Decimal(0));
  const { contributions, ...data } = goal;
  return { ...data, currentAmount, contributions };
}

async function findGoal(ownerClerkId: string, id: string) {
  const goal = await prisma.goal.findFirst({
    where: { id, ownerClerkId },
    include: {
      contributions: { orderBy: { contributedAt: "desc" }, take: RECENT_CONTRIBUTIONS },
    },
  });
  if (!goal) return null;
  const total = await prisma.goalContribution.aggregate({
    where: { goalId: id, ownerClerkId },
    _sum: { amount: true },
  });
  return { goal, totalAmount: total._sum.amount };
}

async function requireGoal(ownerClerkId: string, id: string) {
  const found = await findGoal(ownerClerkId, id);
  if (!found) throw new AppError(404, "Goal was not found.", "GOAL_NOT_FOUND");
  return found;
}

goalsRouter.get("/", async (req, res) => {
  const status = z.nativeEnum(GoalStatus).optional().parse(req.query.status);
  const ownerClerkId = req.auth!.userId;
  const goals = await prisma.goal.findMany({
    where: { ownerClerkId, ...(status ? { status } : {}) },
    include: {
      contributions: { orderBy: { contributedAt: "desc" }, take: RECENT_CONTRIBUTIONS },
    },
    orderBy: [{ status: "asc" }, { deadline: "asc" }, { createdAt: "desc" }],
  });
  const totals = await prisma.goalContribution.groupBy({
    by: ["goalId"],
    where: { ownerClerkId, goalId: { in: goals.map((goal) => goal.id) } },
    _sum: { amount: true },
  });
  const totalByGoal = new Map(totals.map((row) => [row.goalId, row._sum.amount]));
  res.json({
    data: goals.map((goal) => withProgress(goal, totalByGoal.get(goal.id) ?? new Prisma.Decimal(0))),
  });
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
  res.status(201).json({ data: withProgress(goal, new Prisma.Decimal(0)) });
});

goalsRouter.get("/:id", async (req, res) => {
  const { goal, totalAmount } = await requireGoal(req.auth!.userId, req.params.id);
  res.json({ data: withProgress(goal, totalAmount) });
});

goalsRouter.patch("/:id", async (req, res) => {
  const input = goalSchema.partial().parse(req.body);
  const ownerClerkId = req.auth!.userId;
  await requireGoal(ownerClerkId, req.params.id);
  await prisma.goal.update({
    where: { id: req.params.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.targetAmount !== undefined ? { targetAmount: new Prisma.Decimal(input.targetAmount) } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.deadline !== undefined ? { deadline: input.deadline } : {}),
    },
  });
  const { goal, totalAmount } = await requireGoal(ownerClerkId, req.params.id);
  res.json({ data: withProgress(goal, totalAmount) });
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
  const { goal, totalAmount } = await requireGoal(ownerClerkId, req.params.id);
  res.status(201).json({ data: { contribution, goal: withProgress(goal, totalAmount) } });
});

goalsRouter.get("/:id/contributions", async (req, res) => {
  const ownerClerkId = req.auth!.userId;
  const filters = contributionListSchema.parse(req.query);
  await requireGoal(ownerClerkId, req.params.id);
  const where = { goalId: req.params.id, ownerClerkId };
  const [contributions, total] = await Promise.all([
    prisma.goalContribution.findMany({
      where,
      orderBy: { contributedAt: "desc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    prisma.goalContribution.count({ where }),
  ]);
  res.json({
    data: contributions,
    meta: { page: filters.page, pageSize: filters.pageSize, total, pageCount: Math.ceil(total / filters.pageSize) },
  });
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
  const { goal, totalAmount } = await requireGoal(req.auth!.userId, req.params.id);
  res.json({ data: withProgress(goal, totalAmount) });
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
  const { goal, totalAmount } = await requireGoal(req.auth!.userId, req.params.id);
  res.json({ data: withProgress(goal, totalAmount) });
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
