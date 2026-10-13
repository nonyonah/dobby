/**
 * Persisting a tracked wallet's on-chain transfers into the ledger.
 *
 * Until now nothing wrote on-chain activity to `Transaction` at all: Alchemy
 * transfers were proxied live to the browser and discarded. Cash-out and yield
 * detection needs a ledger to reason over, so this is the missing link rather
 * than a second source of truth.
 *
 * Only stablecoins are persisted. Persisting every transfer would put gas, NFT
 * mints and ordinary app interactions into a personal-finance ledger, none of
 * which Dobby can value, tax or explain.
 *
 * Two rules hold throughout:
 *
 * 1. **A stablecoin movement is a TRANSFER, not income and not spending.** The
 *    user's own asset changing form is not a receipt and is not a cost. Only a
 *    confirmed yield event promotes an inflow to income, and only ever the
 *    reward — the principal that earned it never moves across.
 *
 * 2. **Dedupe on the on-chain identity, not the amount.** `hash` alone is not
 *    unique — one transaction can carry several transfers — so the key is the
 *    same composite the provider already merges on, lower-cased so a checksum
 *    variant of a Base address cannot produce a second row for one movement.
 */

import { Prisma, TransactionType, TransferDirection, type Chain } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { getBaseWalletTransfers, getSolanaWalletTransfers, type BaseAssetTransfer } from "../providers/alchemy.js";
import { STABLE_TOKENS, isYieldBearing } from "./config.js";

/** Stable, case-insensitive identity for one on-chain transfer. */
export function onchainExternalId(transfer: Pick<BaseAssetTransfer, "hash" | "from" | "to"> & { value?: number; contract?: string }): string {
  const part = (value: string) => value.toLowerCase();
  return ["onc", part(transfer.hash), part(transfer.from), part(transfer.to), transfer.contract?.toLowerCase() ?? "", String(transfer.value ?? "")].join(":");
}

/** True for the tokens Dobby can value and reason about. */
export function isStableTransfer(transfer: BaseAssetTransfer): boolean {
  const symbol = transfer.asset?.trim();
  if (!symbol) return false;
  return STABLE_TOKENS.has(symbol.toUpperCase()) || isYieldBearing(symbol);
}

function directionOf(transfer: BaseAssetTransfer, wallet: string): TransferDirection | null {
  const walletKey = wallet.toLowerCase();
  if (transfer.to?.toLowerCase() === walletKey) return "IN";
  if (transfer.from?.toLowerCase() === walletKey) return "OUT";
  return null;
}

/** Alchemy returns unix seconds; the ledger stores a Date. */
function occurredAt(transfer: BaseAssetTransfer): Date | null {
  const seconds = transfer.metadata?.blockTimestamp;
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return null;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
}

export type WalletSyncResult = { scanned: number; created: number; skipped: number; duplicates: number };

/**
 * Pulls a wallet's stablecoin transfers and persists the ones not already there.
 *
 * Idempotent by construction: the external id is the on-chain identity, so a
 * second run over the same chain state creates nothing. The provider re-walks a
 * bounded window on every call rather than tracking a cursor, which makes
 * repeated runs the normal case rather than an error case.
 */
export async function syncWalletTransfers(ownerClerkId: string, wallet: { id: string; chain: Chain; address: string }): Promise<WalletSyncResult> {
  const transfers =
    wallet.chain === "BASE" ? await getBaseWalletTransfers(wallet.address) : await getSolanaWalletTransfers(wallet.address);

  const result: WalletSyncResult = { scanned: transfers.length, created: 0, skipped: 0, duplicates: 0 };

  for (const transfer of transfers) {
    if (!isStableTransfer(transfer)) {
      result.skipped += 1;
      continue;
    }
    const direction = directionOf(transfer, wallet.address);
    const at = occurredAt(transfer);
    const externalId = onchainExternalId({
      hash: transfer.hash,
      from: transfer.from ?? "",
      to: transfer.to ?? "",
      value: transfer.value,
      contract: transfer.rawContract?.address,
    });
    // Without a direction the transfer is not this wallet's movement, and
    // without a timestamp it cannot be placed in a tax period. Storing it
    // anyway would put an unplaceable row in the ledger.
    if (!direction || !at) {
      result.skipped += 1;
      continue;
    }

    const existing = await prisma.transaction.findFirst({ where: { ownerClerkId, externalId }, select: { id: true } });
    if (existing) {
      result.duplicates += 1;
      continue;
    }

    const symbol = transfer.asset?.trim() ?? "STABLE";
    await prisma.transaction.create({
      data: {
        ownerClerkId,
        type: TransactionType.TRANSFER,
        // The column forbids negatives; direction is carried by transferDirection.
        amount: new Prisma.Decimal(transfer.value ?? 0),
        currency: "USD",
        assetSymbol: symbol,
        description: describe(symbol, direction, transfer),
        merchant: null,
        occurredAt: at,
        source: "wallet",
        externalId,
        transferDirection: direction,
        // Own asset moving between forms. Not income, and not deductible spend.
        isTaxable: false,
        taxTreatment: "not_taxable",
        metadata: { chain: wallet.chain, hash: transfer.hash },
      },
    });
    result.created += 1;
  }

  logger.info({ ownerClerkId, walletId: wallet.id, ...result }, "wallet stablecoin sync complete");
  return result;
}

function describe(symbol: string, direction: TransferDirection, transfer: BaseAssetTransfer): string {
  const counterparty = direction === "IN" ? transfer.from : transfer.to;
  const short = counterparty ? `${counterparty.slice(0, 6)}…${counterparty.slice(-4)}` : "unknown";
  return direction === "IN" ? `${symbol} received from ${short}` : `${symbol} sent to ${short}`;
}

/** Syncs every active wallet for a user. One slow wallet must not stop the rest. */
export async function syncWallets(ownerClerkId: string): Promise<WalletSyncResult> {
  const wallets = await prisma.walletAccount.findMany({ where: { ownerClerkId, isActive: true }, select: { id: true, chain: true, address: true } });
  const totals: WalletSyncResult = { scanned: 0, created: 0, skipped: 0, duplicates: 0 };
  for (const wallet of wallets) {
    try {
      const one = await syncWalletTransfers(ownerClerkId, wallet);
      totals.scanned += one.scanned;
      totals.created += one.created;
      totals.skipped += one.skipped;
      totals.duplicates += one.duplicates;
    } catch (error) {
      logger.error({ ownerClerkId, walletId: wallet.id, error: error instanceof Error ? error.message : String(error) }, "wallet stablecoin sync failed");
      totals.skipped += 1;
    }
  }
  return totals;
}