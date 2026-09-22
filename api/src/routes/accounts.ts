import { AccountType } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const accountsRouter = Router();
accountsRouter.use(requireAuth);

const accountSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.nativeEnum(AccountType),
  institution: z.string().trim().max(120).nullable().optional(),
  currency: z.string().trim().length(3).toUpperCase().optional(),
  isActive: z.boolean().optional(),
});

accountsRouter.get("/", async (req, res) => {
  const accounts = await prisma.account.findMany({
    where: { ownerClerkId: req.auth!.userId },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
  res.json({ data: accounts });
});

accountsRouter.post("/", async (req, res) => {
  const input = accountSchema.parse(req.body);
  const account = await prisma.account.create({
    data: { ...input, ownerClerkId: req.auth!.userId },
  });
  res.status(201).json({ data: account });
});

accountsRouter.patch("/:id", async (req, res) => {
  const input = accountSchema.partial().parse(req.body);
  const result = await prisma.account.updateMany({
    where: { id: req.params.id, ownerClerkId: req.auth!.userId },
    data: input,
  });
  if (result.count === 0) {
    res.status(404).json({ error: { code: "ACCOUNT_NOT_FOUND", message: "Account was not found." } });
    return;
  }
  const account = await prisma.account.findFirst({ where: { id: req.params.id, ownerClerkId: req.auth!.userId } });
  res.json({ data: account });
});

accountsRouter.delete("/:id", async (req, res) => {
  const result = await prisma.account.updateMany({
    where: { id: req.params.id, ownerClerkId: req.auth!.userId },
    data: { isActive: false },
  });
  if (result.count === 0) {
    res.status(404).json({ error: { code: "ACCOUNT_NOT_FOUND", message: "Account was not found." } });
    return;
  }
  res.status(204).send();
});
