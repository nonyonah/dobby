import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { AppError } from "../middleware/errors.js";
import { logger } from "../lib/logger.js";
import { refreshProviderStatus } from "./integrations.js";
import { runEmailSync } from "../emails/sync.js";

export const emailsRouter = Router();
emailsRouter.use(requireAuth);

const EMAIL_PROVIDERS = ["gmail", "outlook"] as const;

const syncSchema = z.object({
  provider: z.enum(EMAIL_PROVIDERS),
  lookbackDays: z.number().int().min(1).max(730).optional(),
  limit: z.number().int().min(1).max(40).optional(),
});

const listSchema = z.object({
  status: z.enum(["imported", "duplicate", "skipped", "failed"]).optional(),
  kind: z.enum(["statement", "receipt", "alert"]).optional(),
  provider: z.enum(EMAIL_PROVIDERS).optional(),
  take: z.coerce.number().int().min(1).max(200).default(50),
});

/**
 * Start one inbox scan. Returns immediately with a job id; the client polls
 * `GET /v1/emails/sync/:jobId` for progress and duplicate counts.
 */
emailsRouter.post("/sync", async (req, res) => {
  const input = syncSchema.parse(req.body);
  const ownerClerkId = req.auth!.userId;

  const connection = await refreshProviderStatus(ownerClerkId, input.provider);
  if (connection.status !== "connected") {
    throw new AppError(
      409,
      `Connect ${input.provider === "gmail" ? "Gmail" : "Outlook"} in Settings before syncing email.`,
      "EMAIL_PROVIDER_NOT_CONNECTED",
    );
  }

  const running = await prisma.emailSyncJob.findFirst({
    where: { ownerClerkId, provider: input.provider, status: "processing" },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  // Only treat a recent job as in-flight; a crashed run would otherwise block forever.
  if (running && Date.now() - running.createdAt.getTime() < 15 * 60_000) {
    throw new AppError(409, "An email sync is already running for this account.", "EMAIL_SYNC_IN_PROGRESS");
  }

  const job = await prisma.emailSyncJob.create({ data: { ownerClerkId, provider: input.provider } });
  res.status(202).json({ data: { jobId: job.id } });

  void runEmailSync(ownerClerkId, input.provider, job.id, {
    lookbackDays: input.lookbackDays,
    limit: input.limit,
  })
    .then(async (counts) => {
      await prisma.emailSyncJob.update({ where: { id: job.id }, data: { ...counts, status: "completed" } });
      logger.info({ jobId: job.id, provider: input.provider, ...counts }, "email sync completed");
    })
    .catch(async (error) => {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ jobId: job.id, provider: input.provider, error: message }, "email sync failed");
      await prisma.emailSyncJob
        .update({ where: { id: job.id }, data: { status: "failed", errorMessage: message.slice(0, 500) } })
        .catch(() => undefined);
    });
});

emailsRouter.get("/sync", async (req, res) => {
  const jobs = await prisma.emailSyncJob.findMany({
    where: { ownerClerkId: req.auth!.userId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  res.json({ data: jobs });
});

emailsRouter.get("/sync/:jobId", async (req, res) => {
  const job = await prisma.emailSyncJob.findFirst({
    where: { id: req.params.jobId, ownerClerkId: req.auth!.userId },
  });
  if (!job) {
    res.status(404).json({ error: { code: "EMAIL_SYNC_JOB_NOT_FOUND", message: "Email sync job was not found." } });
    return;
  }
  res.json({ data: job });
});

/**
 * Artifacts the sync has already seen. `status=duplicate` is what the UI uses
 * to tell the user a statement or receipt arrived twice.
 */
emailsRouter.get("/imports", async (req, res) => {
  const query = listSchema.parse(req.query);
  const items = await prisma.emailImport.findMany({
    where: {
      ownerClerkId: req.auth!.userId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.provider ? { provider: query.provider } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: query.take,
  });
  res.json({ data: items });
});
