import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { sendMonthInReviewNotification } from "../lib/mailer.js";

/**
 * The first-import summary, sent once per user.
 *
 * Two problems make this less trivial than "email them after the first import":
 *
 *   1. **Batches.** Someone dropping five CSVs in at once should get one email
 *      describing their month, not five describing whichever file finished
 *      first. So it waits out a short delay after the first import finishes,
 *      which lets the rest of the batch land.
 *   2. **Exactly once.** The job sweeps on a timer, and a timer overlaps itself
 *      across restarts. `firstImportSummarySentAt` is therefore claimed before
 *      the send, with a conditional update that only one caller can win — a
 *      read-then-write would let two runs both decide they were first.
 *
 * It replaces the ordinary import email for the first import only. When the
 * delay has passed we send this instead, and the normal email is what later
 * imports get, so the same import never produces both.
 */

const DELAY_MS = 10 * 60 * 1000;
/** Below this an import is too thin to summarise; the normal email says more. */
export const MIN_FIRST_IMPORT_TRANSACTIONS = 10;

export async function runFirstImportSummaries(now = new Date()) {
  // Only accounts that have imported, never been sent one, and finished their
  // first import at least one delay ago.
  const due = await prisma.user.findMany({
    where: {
      firstImportSummarySentAt: null,
      imports: { some: { status: "COMPLETED", createdAt: { lte: new Date(now.getTime() - DELAY_MS) } } },
      email: { not: null },
    },
    select: { clerkId: true, email: true },
    take: 200,
  });
  if (due.length === 0) return { sent: 0, skipped: 0, tooFew: 0 };

  let sent = 0;
  let skipped = 0;
  let tooFew = 0;

  for (const user of due) {
    // Claim it first. `updateMany` with the null check is the whole idempotency
    // guarantee: two sweeps racing here produce one winner and one zero-row
    // update, and the loser walks away without sending.
    const claimed = await prisma.user.updateMany({
      where: { clerkId: user.clerkId, firstImportSummarySentAt: null },
      data: { firstImportSummarySentAt: now },
    });
    if (claimed.count === 0) continue;

    try {
      const outcome = await sendIfWorthSending(user.clerkId, now);
      if (outcome === "sent") sent += 1;
      else if (outcome === "tooFew") tooFew += 1;
      else skipped += 1;
    } catch (error) {
      // Un-claim on failure so the next sweep retries. Leaving it claimed would
      // mean a transient mail error silently costs the user their one email.
      await prisma.user
        .update({ where: { clerkId: user.clerkId }, data: { firstImportSummarySentAt: null } })
        .catch(() => undefined);
      logger.error({ clerkId: user.clerkId, err: error }, "first-import summary failed; will retry");
    }
  }

  logger.info({ due: due.length, sent, tooFew, skipped }, "first-import summary sweep complete");
  return { sent, skipped, tooFew };
}

/**
 * Whether this import is worth a summary, and the window to summarise.
 *
 * A failed import, or one that produced almost nothing, gets the ordinary
 * import-completed email instead — "here is what came in" beats "here is your
 * month" when there is no month to speak of.
 */
async function sendIfWorthSending(ownerClerkId: string, now: Date): Promise<"sent" | "tooFew" | "skipped"> {
  const first = await prisma.transactionImport.findFirst({
    where: { ownerClerkId, status: "COMPLETED" },
    orderBy: { createdAt: "asc" },
    select: { rowCount: true, createdAt: true },
  });
  if (!first) return "skipped";
  if ((first.rowCount ?? 0) < MIN_FIRST_IMPORT_TRANSACTIONS) return "tooFew";

  // Prefer the calendar month before the import, falling back to the import's
  // own dates when the statement covers a partial one — a fortnight should be
  // labelled "27 Jun - 26 Jul", not "June".
  const { from, to } = await resolveWindow(ownerClerkId, first.createdAt, now);
  return (await sendMonthInReviewNotification({ ownerClerkId, from, to })) ? "sent" : "skipped";
}

/** The most recent full calendar month with data, or the import's own span. */
async function resolveWindow(ownerClerkId: string, importAt: Date, now: Date): Promise<{ from: Date; to: Date }> {
  const earliest = await prisma.transaction.findFirst({
    where: { ownerClerkId },
    orderBy: { occurredAt: "asc" },
    select: { occurredAt: true },
  });
  const latest = await prisma.transaction.findFirst({
    where: { ownerClerkId },
    orderBy: { occurredAt: "desc" },
    select: { occurredAt: true },
  });
  const first = earliest?.occurredAt ?? importAt;
  const last = latest?.occurredAt ?? importAt;

  const spansOneFullMonth =
    first.getUTCDate() === 1 &&
    last.getUTCDate() === new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 0)).getUTCDate();

  if (spansOneFullMonth) {
    const monthStart = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), 1));
    // The last instant of the month, not the first instant of the next one:
    // `buildInsightsSummary` treats `to` as inclusive, so passing the 1st would
    // pull a midnight transaction into this month *and* the next — and the
    // email would then disagree with the Insights page for both.
    const monthEnd = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 1) - 1);
    return { from: monthStart, to: monthEnd };
  }
  void now;
  return { from: first, to: new Date(last.getTime() + 24 * 60 * 60 * 1000) };
}