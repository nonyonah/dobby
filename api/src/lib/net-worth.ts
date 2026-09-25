import { Chain } from "@prisma/client";
import { prisma } from "./prisma.js";
import { env } from "../config/env.js";
import { AppError } from "../middleware/errors.js";
import { logger } from "./logger.js";
import { getBaseWalletBalances } from "../providers/alchemy.js";
import { getBlockscoutBalances } from "./blockscout.js";

/**
 * Stablecoin contracts that redeem at $1, keyed by `chain:address`.
 *
 * Matched by contract rather than symbol because anyone can mint an ERC-20
 * whose symbol reads "USDC"; only the audited issuers below count toward the
 * total. Everything else is returned unvalued instead of guessed at.
 */
const STABLE_CONTRACTS = new Set([
  "base:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // USDC (Circle, Base)
  "base:0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca", // USDC.e (bridged, Base)
  "solana:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "solana:Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
]);

/** EVM addresses are case-insensitive; Solana mints are not. */
const contractKey = (chain: Chain, address?: string) =>
  address ? `${chain.toLowerCase()}:${chain === Chain.BASE ? address.toLowerCase() : address}` : null;

export interface NetWorthHolding {
  walletId: string;
  symbol: string;
  amount: number;
  /** `null` when the asset has no dollar parity, so it is excluded from the total. */
  usdValue: number | null;
}

export interface NetWorthWalletStatus {
  id: string;
  displayName: string;
  chain: Chain;
  address: string;
  status: "ok" | "provider_unconfigured" | "error";
  detail?: string;
}

export interface NetWorthSnapshot {
  asOf: string;
  currency: "USD";
  totalUsd: number;
  holdings: NetWorthHolding[];
  wallets: NetWorthWalletStatus[];
  unpricedCount: number;
}

async function fetchBalances(chain: Chain, address: string): Promise<Array<{ symbol: string; amount: number; address?: string }>> {
  if (chain === Chain.BASE && envAlchemyConfigured()) return getBaseWalletBalances(address);
  return getBlockscoutBalances(chain, address);
}

function envAlchemyConfigured() {
  return Boolean(env.ALCHEMY_BASE_API_URL && env.ALCHEMY_API_KEY);
}

/**
 * Net worth across the user's connected wallets, from live on-chain balances.
 *
 * Only audited stablecoin contracts are valued, which keeps the total honest
 * without a price feed: volatile assets (ETH, SOL) and unrecognized tokens come
 * back with `usdValue: null`, and the UI lists them separately rather than
 * inventing a number for them.
 */
export async function buildNetWorthSnapshot(ownerClerkId: string): Promise<NetWorthSnapshot> {
  const wallets = await prisma.walletAccount.findMany({
    where: { ownerClerkId, isActive: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  const resolved = await Promise.all(wallets.map(async (wallet) => {
    try {
      const balances = await fetchBalances(wallet.chain, wallet.address);
      return { wallet, balances, status: "ok" as const, detail: undefined };
    } catch (error) {
      const code = error instanceof AppError ? error.code : "UNKNOWN";
      const message = error instanceof Error ? error.message : "Balance lookup failed.";
      const status = code === "BLOCKSCOUT_NOT_CONFIGURED" || code === "ALCHEMY_NOT_CONFIGURED"
        ? ("provider_unconfigured" as const)
        : ("error" as const);
      logger.info({ ownerClerkId, walletId: wallet.id, code }, "Net worth balance lookup failed");
      return { wallet, balances: [], status, detail: message };
    }
  }));

  const holdings: NetWorthHolding[] = [];
  let totalUsd = 0;
  let unpricedCount = 0;
  for (const entry of resolved) {
    for (const balance of entry.balances) {
      const symbol = balance.symbol.toUpperCase();
      const key = contractKey(entry.wallet.chain, balance.address);
      const priced = key !== null && STABLE_CONTRACTS.has(key);
      if (priced) totalUsd += balance.amount;
      else unpricedCount += 1;
      holdings.push({ walletId: entry.wallet.id, symbol, amount: balance.amount, usdValue: priced ? balance.amount : null });
    }
  }
  holdings.sort((a, b) => (b.usdValue ?? -1) - (a.usdValue ?? -1) || b.amount - a.amount);

  return {
    asOf: new Date().toISOString(),
    currency: "USD",
    totalUsd: Math.round(totalUsd * 100) / 100,
    holdings,
    unpricedCount,
    wallets: resolved.map((entry) => ({
      id: entry.wallet.id,
      displayName: entry.wallet.displayName,
      chain: entry.wallet.chain,
      address: entry.wallet.address,
      status: entry.status,
      detail: entry.detail,
    })),
  };
}
