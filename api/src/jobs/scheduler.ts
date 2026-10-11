import cron from "node-cron";
import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { runMonthlyTaxReminder } from "./monthly-tax-reminder.js";
import { runFilingDeadlineReminders } from "./filing-deadline-reminder.js";
import { runFirstImportSummaries } from "./first-import-summary.js";

const TIMEZONE = "UTC";

function logged(name: string, task: () => Promise<unknown>) {
  return async () => {
    try {
      const result = await task();
      logger.info({ job: name, result }, "scheduled job completed");
    } catch (error) {
      logger.error({ job: name, error: error instanceof Error ? error.message : String(error) }, "scheduled job failed");
    }
  };
}

/**
 * In-process cron (UTC): the monthly tax digest on the 1st at 09:00 and the
 * filing-deadline check every morning at 09:00. Both jobs are idempotent
 * (ReminderLog dedupes), so restarts and overlapping runs never double-send.
 */
export function startScheduler() {
  // A restart mid-sync leaves "processing" jobs behind with no worker. Fail
  // them loudly once at boot so users get a truthful state and can retry —
  // the 15-minute in-flight guard already protects genuinely live runs.
  void prisma.emailSyncJob
    .updateMany({
      where: { status: "processing", updatedAt: { lt: new Date(Date.now() - 15 * 60_000) } },
      data: { status: "failed", errorMessage: "Sync was interrupted — please run it again." },
    })
    .then((result) => {
      if (result.count > 0) logger.info({ interrupted: result.count }, "marked stale email syncs as failed at boot");
    })
    .catch((error) => logger.warn({ error: error instanceof Error ? error.message : String(error) }, "stale sync cleanup failed"));
  const tasks = [
    cron.schedule("0 9 1 * *", logged("monthly-tax-reminder", () => runMonthlyTaxReminder()), { timezone: TIMEZONE }),
    cron.schedule("0 9 * * *", logged("filing-deadline-reminder", () => runFilingDeadlineReminders()), { timezone: TIMEZONE }),
    // Every five minutes rather than daily: the first-import email waits out a
    // ten-minute delay so a batch of files uploads is summarised together, and a
    // daily tick would deliver it hours late. The sweep is a single indexed
    // claim per due account, so the extra runs cost one query apiece.
    cron.schedule("*/5 * * * *", logged("first-import-summary", () => runFirstImportSummaries()), { timezone: TIMEZONE }),
  ];
  logger.info({ timezone: TIMEZONE }, "job scheduler started: monthly tax digest, daily filing-deadline check, first-import summary sweep");
  return () => tasks.forEach((task) => task.stop());
}
