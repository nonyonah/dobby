/**
 * The daily mailbox sweep.
 *
 * Until this existed, email auto-fetch only ran when somebody pressed Sync, so
 * "auto-fetch" was a misnomer: a customer who connected their mailbox and then
 * did nothing would never see the statement their bank emailed them. This runs
 * once a day for every connected mailbox.
 *
 * Three properties matter more than the scheduling:
 *
 *   - **It is a delta, not a full re-read.** A short lookback catches what
 *     arrived since yesterday. The layer that makes re-importing impossible is
 *     the message-id and content-hash record in `EmailImport`, so a wider window
 *     would not double-import anything — it would just cost a provider quota to
 *     rediscover it.
 *   - **One account failing does not stop the rest.** Each mailbox is run
 *     independently and its failure recorded against that account's job row.
 *   - **It skips accounts with a sync already in flight**, so a manual sync
 *     running at 09:00 does not get a second one piled on top of it.
 */

import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { runEmailSync, syncColumns } from "../emails/sync.js";
import { entitlementSelect, getEntitlement } from "../lib/entitlement.js";
import type { EmailProvider } from "../emails/providers.js";

/**
 * How far back a daily run looks.
 *
 * Three days rather than one, because a statement that arrived on Friday while
 * the service was down should still be found on Saturday. Costs a little
 * provider quota and buys a sweep that survives a missed day.
 */
const DAILY_LOOKBACK_DAYS = 3;

/** A job heartbeated within this long is genuinely running. */
const IN_FLIGHT_MS = 15 * 60_000;

export type DailySyncResult = {
  accounts: number;
  synced: number;
  failed: number;
  skipped: number;
};

export async function runDailyEmailSyncs(now = new Date()): Promise<DailySyncResult> {
  const result: DailySyncResult = { accounts: 0, synced: 0, failed: 0, skipped: 0 };

  const connections = await prisma.integrationConnection.findMany({
    where: { status: "connected" },
    select: { ownerClerkId: true, provider: true },
    take: 500,
  });
  if (connections.length === 0) return result;

  // Pro only, exactly as the manual route's `assertPro` does.
  //
  // Every document pulled from Composio is a charge we absorb, so sweeping a
  // mailbox on behalf of an account that cannot use email auto-fetch would be
  // paying a provider bill for nothing — and doing it quietly, once a day,
  // forever. The connection outliving a downgrade is the normal case here: a
  // mailbox stays connected after a trial lapses.
  const owners = await prisma.user.findMany({
    where: { clerkId: { in: [...new Set(connections.map((c) => c.ownerClerkId))] } },
    select: { clerkId: true, ...entitlementSelect },
  });
  const entitled = new Set(
    owners.filter((owner) => getEntitlement(owner).isPro).map((owner) => owner.clerkId),
  );

  for (const connection of connections) {
    result.accounts += 1;
    const provider = connection.provider as EmailProvider;

    if (!entitled.has(connection.ownerClerkId)) {
      result.skipped += 1;
      continue;
    }

    try {
      const running = await prisma.emailSyncJob.findFirst({
        where: { ownerClerkId: connection.ownerClerkId, provider, status: "processing" },
        select: { updatedAt: true },
        orderBy: { createdAt: "desc" },
      });
      if (running && now.getTime() - running.updatedAt.getTime() < IN_FLIGHT_MS) {
        result.skipped += 1;
        continue;
      }

      const job = await prisma.emailSyncJob.create({
        data: { ownerClerkId: connection.ownerClerkId, provider },
        select: { id: true },
      });

      // Not awaited: one mailbox taking a minute must not hold up the other 499.
      void runEmailSync(connection.ownerClerkId, provider, job.id, { lookbackDays: DAILY_LOOKBACK_DAYS })
        .then(async (counts) => {
          const columns = syncColumns(counts);
          await prisma.emailSyncJob.update({
            where: { id: job.id },
            data: { ...columns, status: "completed" },
          });
          result.synced += 1;
          logger.info({ clerkId: connection.ownerClerkId, provider, ...columns }, "daily email sync completed");
        })
        .catch(async (error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          result.failed += 1;
          logger.error({ clerkId: connection.ownerClerkId, provider, error: message }, "daily email sync failed");
          await prisma.emailSyncJob
            .update({
              where: { id: job.id },
              data: { status: "failed", errorMessage: message.slice(0, 500) },
            })
            .catch(() => undefined);
        });
    } catch (error) {
      result.failed += 1;
      logger.error(
        { clerkId: connection.ownerClerkId, provider, error: error instanceof Error ? error.message : String(error) },
        "could not start the daily email sync for this mailbox",
      );
    }
  }

  logger.info(result, "daily email sync sweep complete");
  return result;
}