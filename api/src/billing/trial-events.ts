/**
 * Durable trial lifecycle events.
 *
 * Dobby needs to know who started a trial and who came out of one paid, and the
 * answer has to survive a user who never grants analytics consent, clears
 * cookies, or switches browsers. A client-side event cannot: it is reported by
 * whoever happens to still be opted in, which is exactly the population least
 * representative of the signups you care about.
 *
 * So this writes to `AuditEvent`, which was defined in the schema from the start
 * and never written to. Reusing it rather than adding a table means the record
 * joins the rest of the user's history instead of sitting in a parallel ledger
 * nobody remembers to read.
 *
 * Writes are best-effort. An analytics record must never be the reason a trial
 * fails to start or a subscription fails to reconcile — the caller's own write
 * has already succeeded by the time this runs.
 */

import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";

export const TRIAL_STARTED = "trial.started";
export const TRIAL_CONVERTED = "trial.converted";
export const TRIAL_LAPSED = "trial.lapsed";

/**
 * Records one event, swallowing failures.
 *
 * `metadata` carries the facts worth aggregating on — never the amounts, and
 * never anything identifying beyond the owner id already on the row.
 */
export async function recordTrialEvent(
  ownerClerkId: string,
  action: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: {
        ownerClerkId,
        action,
        entityType: "trial",
        metadata: metadata as never,
      },
    });
  } catch (error) {
    logger.warn({ ownerClerkId, action, error: error instanceof Error ? error.message : String(error) }, "could not record trial event");
  }
}