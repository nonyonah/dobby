/**
 * Detection triggers.
 *
 * Detection runs after the four things that can produce evidence — a wallet
 * sync, an import, an email sync, and nightly as a backstop — because a
 * cash-out is only visible once both its legs exist, and neither leg arrives on
 * a schedule we control.
 *
 * Every trigger is idempotent through the unique constraints on
 * `StablecoinEvent`, not through a read-before-write check: these run
 * concurrently across triggers and an in-process check would lose that race
 * exactly when a wallet sync and an email sync both see the same movement.
 *
 * Failures are contained per owner. A provider outage on one wallet must not
 * stop the other users' detection, and must never surface as a failed import.
 */

import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { detectStablecoinEvents } from "./detect.js";
import { syncWallets } from "./wallet-sync.js";

/** Detection for one user, swallowing provider errors rather than failing the caller. */
export async function runStablecoinDetection(ownerClerkId: string): Promise<void> {
  try {
    await detectStablecoinEvents(ownerClerkId);
  } catch (error) {
    logger.error({ ownerClerkId, error: error instanceof Error ? error.message : String(error) }, "stablecoin detection failed");
  }
}

/** Wallet sync, then detection over the freshly persisted ledger. */
export async function runWalletSyncAndDetect(ownerClerkId: string): Promise<void> {
  try {
    await syncWallets(ownerClerkId);
  } catch (error) {
    logger.error({ ownerClerkId, error: error instanceof Error ? error.message : String(error) }, "stablecoin wallet sync failed");
  }
  await runStablecoinDetection(ownerClerkId);
}

/**
 * Nightly sweep: sync every wallet, then detect over what the sync wrote.
 *
 * The sync has to come first. Detection pairs a stablecoin outflow against a
 * naira credit, and until a wallet's transfers are actually in the ledger there
 * is no outflow to pair — so a detect-only sweep reads an empty ledger and
 * correctly finds nothing, every night, forever.
 */
export async function runStablecoinNightly(): Promise<{ owners: number; scanned: number; created: number; events: number; duplicates: number }> {
  const owners = await prisma.walletAccount.findMany({ where: { isActive: true }, select: { ownerClerkId: true }, distinct: ["ownerClerkId"] });
  let scanned = 0;
  let created = 0;
  let events = 0;
  let duplicates = 0;
  for (const owner of owners) {
    try {
      const sync = await syncWallets(owner.ownerClerkId);
      scanned += sync.scanned;
      created += sync.created;
      const result = await detectStablecoinEvents(owner.ownerClerkId);
      events += result.created;
      duplicates += result.duplicates;
    } catch (error) {
      logger.error({ ownerClerkId: owner.ownerClerkId, error: error instanceof Error ? error.message : String(error) }, "nightly stablecoin sync failed");
    }
  }
  logger.info({ owners: owners.length, scanned, created, events, duplicates }, "nightly stablecoin sweep complete");
  return { owners: owners.length, scanned, created, events, duplicates };
}