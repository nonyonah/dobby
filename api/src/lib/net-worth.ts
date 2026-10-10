import { Chain } from "@prisma/client";
import { prisma } from "./prisma.js";
import { AppError } from "../middleware/errors.js";
import { logger } from "./logger.js";
import { alchemyConfigured, getBaseWalletBalances, getSolanaWalletBalances } from "../providers/alchemy.js";
import { getBlockscoutBalances } from "./blockscout.js";
import { getConversionFactors } from "../providers/frankfurter.js";

const round2 = (value: number) => Math.round(value * 100) / 100;

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

export interface NetWorthAccount {
  id: string;
  name: string;
  currency: string;
  /** Net ledger position in the account's own currency: income minus expenses. */
  balance: number;
  /** Same position in USD; `null` when no rate is available. */
  balanceUsd: number | null;
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
  accounts: NetWorthAccount[];
  wallets: NetWorthWalletStatus[];
  unpricedCount: number;
}

async function fetchBalances(chain: Chain, address: string): Promise<Array<{ symbol: string; amount: number; address?: string }>> {
  // Alchemy first wherever it is wired, then Blockscout as the EVM fallback.
  // Solana has no Blockscout, so without a Solana Alchemy key it falls through
  // and surfaces as provider_unconfigured rather than a bogus zero balance.
  if (chain === Chain.BASE && alchemyConfigured("base")) return getBaseWalletBalances(address);
  if (chain === Chain.SOLANA && alchemyConfigured("solana")) return getSolanaWalletBalances(address);
  return getBlockscoutBalances(chain, address);
}

/**
 * Net worth across everything the user has: connected wallets (live on-chain
 * stablecoin balances) plus every bank/account's net ledger position.
 *
 * Only audited stablecoin contracts are valued, which keeps the wallet total
 * honest without a price feed: volatile assets (ETH, SOL) and unrecognized
 * tokens come back with `usdValue: null`, and the UI lists them separately
 * rather than inventing a number for them. CNGN is Nigeria's stablecoin, so
 * it is priced off the naira rate like any other NGN amount.
 */
/**
 * Signed contribution of one grouped row to an account balance.
 *
 * A transfer is signed by `transferDirection` rather than by its type: both legs
 * of a movement are TRANSFER, so the type alone cannot say which account lost
 * the money and which gained it. Rows that predate the field have no direction
 * and are treated as outflows — the conservative reading, since an unknown
 * direction nets to zero across the pair anyway.
 */
export function signedFor(type: string, direction: string | null, magnitude: number): number {
  if (type === "INCOME") return magnitude;
  if (type === "TRANSFER") return direction === "IN" ? magnitude : -magnitude;
  return -magnitude;
}

export async function buildNetWorthSnapshot(ownerClerkId: string): Promise<NetWorthSnapshot> {
  const [wallets, accounts, grouped] = await Promise.all([
    prisma.walletAccount.findMany({
      where: { ownerClerkId, isActive: true },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    }),
    prisma.account.findMany({ where: { ownerClerkId, isActive: true }, orderBy: { createdAt: "asc" } }),
    prisma.transaction.groupBy({
      by: ["accountId", "type", "currency", "transferDirection"],
      where: { ownerClerkId },
      _sum: { amount: true },
    }),
  ]);

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

  // One rate per currency covers both sides of every conversion below. The seeded
  // set covers every supported jurisdiction so an account with no activity still
  // gets a real rate instead of silently contributing an identity conversion.
  const currencies = new Set<string>(["NGN", "USD", "GBP", "CAD", "KES", "ZAR"]);
  for (const account of accounts) currencies.add(account.currency.toUpperCase());
  for (const row of grouped) currencies.add((row.currency ?? "USD").toUpperCase());
  const usdRates = await getConversionFactors(currencies, "USD");
  const rateToUsd = (code: string) => usdRates.get(code.toUpperCase()) ?? null;

  let totalUsd = 0;
  let unpricedCount = 0;
  const holdings: NetWorthHolding[] = [];
  for (const entry of resolved) {
    for (const balance of entry.balances) {
      const symbol = balance.symbol.toUpperCase();
      const key = contractKey(entry.wallet.chain, balance.address);
      const priced = key !== null && STABLE_CONTRACTS.has(key);
      let usdValue: number | null = priced ? balance.amount : null;
      if (usdValue === null && symbol === "CNGN") {
        const rate = rateToUsd("NGN");
        usdValue = rate === null ? null : balance.amount * rate;
      }
      if (usdValue !== null) totalUsd += usdValue;
      else unpricedCount += 1;
      holdings.push({ walletId: entry.wallet.id, symbol, amount: balance.amount, usdValue });
    }
  }
  holdings.sort((a, b) => (b.usdValue ?? -1) - (a.usdValue ?? -1) || b.amount - a.amount);

  const rowsByAccount = new Map<string, typeof grouped>();
  for (const row of grouped) {
    if (!row.accountId) continue;
    const list = rowsByAccount.get(row.accountId) ?? [];
    list.push(row);
    rowsByAccount.set(row.accountId, list);
  }

  const accountsSnapshot: NetWorthAccount[] = [];
  for (const account of accounts) {
    const accountCurrency = account.currency.toUpperCase();
    const accountRate = rateToUsd(accountCurrency);
    let balance = 0;
    for (const row of rowsByAccount.get(account.id) ?? []) {
      const magnitude = Math.abs(Number(row._sum.amount ?? 0));
      const txCurrency = (row.currency ?? "USD").toUpperCase();
      const txRate = rateToUsd(txCurrency);
      // Go through USD so an NGN transaction on a USD account converts once.
      const converted = txRate !== null && accountRate
        ? (magnitude * txRate) / accountRate
        : txCurrency === accountCurrency ? magnitude : null;
      if (converted === null) continue;
      // A transfer moves money between pockets the user owns, so it has to be
      // counted — in the right direction on each account. Counting both legs as
      // outflows (which is what "anything that is not INCOME" did) subtracted the
      // movement twice and shrank net worth by the whole transfer.
      balance += signedFor(row.type, row.transferDirection, converted);
    }
    const balanceUsd = accountRate === null ? null : balance * accountRate;
    accountsSnapshot.push({
      id: account.id,
      name: account.name,
      currency: accountCurrency,
      balance: round2(balance),
      balanceUsd: balanceUsd === null ? null : round2(balanceUsd),
    });
    if (balanceUsd !== null) totalUsd += balanceUsd;
  }

  // Imported and manually added transactions usually have no account yet —
  // they still count. Aggregate them per currency into synthetic rows so the
  // money is visible instead of silently dropped.
  const unassigned = new Map<string, number>();
  for (const row of grouped) {
    if (row.accountId) continue;
    const txCurrency = (row.currency ?? "USD").toUpperCase();
    const magnitude = Math.abs(Number(row._sum.amount ?? 0));
    unassigned.set(txCurrency, (unassigned.get(txCurrency) ?? 0) + signedFor(row.type, row.transferDirection, magnitude));
  }
  for (const [txCurrency, balance] of unassigned) {
    const rate = rateToUsd(txCurrency);
    const balanceUsd = rate === null ? null : round2(balance * rate);
    accountsSnapshot.push({
      id: `unassigned-${txCurrency.toLowerCase()}`,
      name: `Imported transactions (${txCurrency})`,
      currency: txCurrency,
      balance: round2(balance),
      balanceUsd,
    });
    if (balanceUsd !== null) totalUsd += balanceUsd;
  }

  return {
    asOf: new Date().toISOString(),
    currency: "USD",
    totalUsd: round2(totalUsd),
    holdings,
    accounts: accountsSnapshot,
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
