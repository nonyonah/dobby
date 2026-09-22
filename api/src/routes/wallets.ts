import { Router } from "express";
import { Chain } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { getBlockscoutAddressSummary } from "../lib/blockscout.js";
import { getBaseWalletTransfers } from "../providers/alchemy.js";
import { env } from "../config/env.js";
import { requireAuth } from "../middleware/auth.js";

export const walletsRouter = Router();
walletsRouter.use(requireAuth);

const walletSchema = z.object({
  chain: z.nativeEnum(Chain),
  address: z.string().trim().min(1).max(128),
  displayName: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  isDefault: z.boolean().optional().default(false),
});

function validateAddress(chain: Chain, address: string) {
  if (chain === Chain.BASE && !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return "Base addresses must be valid 20-byte hexadecimal addresses.";
  }
  if (chain === Chain.SOLANA && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
    return "Solana addresses must be valid Base58 public keys.";
  }
  return undefined;
}

walletsRouter.get("/", async (req, res) => {
  const wallets = await prisma.walletAccount.findMany({
    where: { ownerClerkId: req.auth!.userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  res.json({ data: wallets });
});

walletsRouter.post("/", async (req, res) => {
  const input = walletSchema.parse(req.body);
  const address = input.chain === Chain.BASE ? input.address.toLowerCase() : input.address;
  const validationError = validateAddress(input.chain, address);

  if (validationError) {
    res.status(400).json({ error: { code: "INVALID_WALLET_ADDRESS", message: validationError } });
    return;
  }

  const ownerClerkId = req.auth!.userId;
  const wallet = await prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.walletAccount.updateMany({ where: { ownerClerkId }, data: { isDefault: false } });
    }
    return tx.walletAccount.create({
      data: {
        ownerClerkId,
        chain: input.chain,
        address,
        displayName: input.displayName,
        color: input.color,
        isDefault: input.isDefault,
      },
    });
  });

  res.status(201).json({ data: wallet });
});

walletsRouter.patch("/:id", async (req, res) => {
  const input = walletSchema.partial().parse(req.body);
  const ownerClerkId = req.auth!.userId;
  const existing = await prisma.walletAccount.findFirst({ where: { id: req.params.id, ownerClerkId } });

  if (!existing) {
    res.status(404).json({ error: { code: "WALLET_NOT_FOUND", message: "Wallet was not found." } });
    return;
  }

  const chain = input.chain ?? existing.chain;
  const address = input.address
    ? chain === Chain.BASE
      ? input.address.toLowerCase()
      : input.address
    : existing.address;
  const validationError = validateAddress(chain, address);
  if (validationError) {
    res.status(400).json({ error: { code: "INVALID_WALLET_ADDRESS", message: validationError } });
    return;
  }

  const wallet = await prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.walletAccount.updateMany({ where: { ownerClerkId }, data: { isDefault: false } });
    }
    return tx.walletAccount.update({
      where: { id: existing.id },
      data: { ...input, chain, address },
    });
  });

  res.json({ data: wallet });
});

walletsRouter.delete("/:id", async (req, res) => {
  const result = await prisma.walletAccount.deleteMany({
    where: { id: req.params.id, ownerClerkId: req.auth!.userId },
  });
  if (result.count === 0) {
    res.status(404).json({ error: { code: "WALLET_NOT_FOUND", message: "Wallet was not found." } });
    return;
  }
  res.status(204).send();
});

walletsRouter.get("/:id/summary", async (req, res) => {
  const wallet = await prisma.walletAccount.findFirst({ where: { id: req.params.id, ownerClerkId: req.auth!.userId } });
  if (!wallet) {
    res.status(404).json({ error: { code: "WALLET_NOT_FOUND", message: "Wallet was not found." } });
    return;
  }
  if (wallet.chain === Chain.BASE && env.ALCHEMY_BASE_API_URL && env.ALCHEMY_API_KEY) {
    res.json({ data: { chain: wallet.chain, address: wallet.address, provider: "alchemy", transfers: await getBaseWalletTransfers(wallet.address) } });
    return;
  }
  res.json({ data: await getBlockscoutAddressSummary(wallet.chain, wallet.address) });
});
