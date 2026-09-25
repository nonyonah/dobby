import { ImportStatus, ImportType, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { createUploadUrl, storePrivateObject } from "../lib/r2.js";
import { isPdfImport, processImportRecord, processPdfStatement } from "../imports/pipeline.js";
import { requireAuth } from "../middleware/auth.js";
import { logger } from "../lib/logger.js";

export const importsRouter = Router();
importsRouter.use(requireAuth);

const presignSchema = z.object({
  originalName: z.string().trim().min(1).max(255),
  type: z.nativeEnum(ImportType).default(ImportType.CSV),
  contentType: z.enum(["text/csv", "text/plain", "application/vnd.ms-excel", "application/ofx", "application/x-ofx", "application/qfx", "application/pdf", "image/jpeg", "image/png", "image/webp"]),
});

importsRouter.get("/", async (req, res) => {
  const imports = await prisma.transactionImport.findMany({
    where: { ownerClerkId: req.auth!.userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json({ data: imports });
});

importsRouter.post("/presign", async (req, res) => {
  const input = presignSchema.parse(req.body);
  const extension = input.originalName.split(".").pop()?.toLowerCase() || input.type.toLowerCase();
  const id = randomUUID();
  const objectKey = `users/${req.auth!.userId}/imports/${id}.${extension}`;
  const uploadUrl = await createUploadUrl(objectKey, input.contentType);
  const record = await prisma.transactionImport.create({
    data: {
      ownerClerkId: req.auth!.userId,
      type: input.type,
      status: "CREATED",
      objectKey,
      originalName: input.originalName,
    },
  });

  res.status(201).json({ data: { import: record, uploadUrl, expiresInSeconds: 900 } });
});

importsRouter.put("/:id/file", async (req, res) => {
  const record = await prisma.transactionImport.findFirst({ where: { id: req.params.id, ownerClerkId: req.auth!.userId } });
  if (!record?.objectKey) {
    res.status(404).json({ error: { code: "IMPORT_NOT_FOUND", message: "Import was not found." } });
    return;
  }
  if (!Buffer.isBuffer(req.body)) {
    res.status(400).json({ error: { code: "IMPORT_FILE_INVALID", message: "Upload body must be a binary file." } });
    return;
  }
  await storePrivateObject(record.objectKey, req.header("content-type") ?? "application/octet-stream", req.body);
  res.status(204).send();
});

importsRouter.post("/:id/process", async (req, res) => {
  const ownerClerkId = req.auth!.userId;
  const record = await prisma.transactionImport.findFirst({ where: { id: req.params.id, ownerClerkId } });
  if (!record) {
    res.status(404).json({ error: { code: "IMPORT_NOT_FOUND", message: "Import was not found." } });
    return;
  }
  if (!record.objectKey) {
    res.status(400).json({ error: { code: "IMPORT_FILE_MISSING", message: "Import has no stored file." } });
    return;
  }
  const objectKey = record.objectKey;
  if (record.status === ImportStatus.PROCESSING) {
    res.status(409).json({ error: { code: "IMPORT_ALREADY_PROCESSING", message: "Import is already processing." } });
    return;
  }

  await prisma.transactionImport.update({ where: { id: record.id }, data: { status: ImportStatus.PROCESSING, errorMessage: null } });
  if (isPdfImport(record)) {
    void processPdfStatement(ownerClerkId, { id: record.id, objectKey }).catch(async (error) => {
      logger.error({ importId: record.id, error: error instanceof Error ? error.message : String(error) }, "PDF bank statement job failed");
      await prisma.transactionImport.update({ where: { id: record.id }, data: { status: ImportStatus.FAILED, errorMessage: error instanceof Error ? error.message : "PDF statement processing failed." } });
    });
    res.status(202).json({ data: { importId: record.id, jobId: record.id, status: ImportStatus.PROCESSING } });
    return;
  }
  try {
    const { rowCount, reviewCount } = await processImportRecord(ownerClerkId, { ...record, objectKey });
    res.json({ data: { importId: record.id, rowCount, reviewCount } });
  } catch (error) {
    await prisma.transactionImport.update({ where: { id: record.id }, data: { status: ImportStatus.FAILED, errorMessage: error instanceof Error ? error.message : "Import processing failed." } });
    throw error;
  }
});

importsRouter.get("/jobs/:id", async (req, res) => {
  const job = await prisma.transactionImport.findFirst({
    where: { id: req.params.id, ownerClerkId: req.auth!.userId },
    select: { id: true, status: true, rowCount: true, errorMessage: true, createdAt: true, updatedAt: true },
  });
  if (!job) {
    res.status(404).json({ error: { code: "IMPORT_JOB_NOT_FOUND", message: "Import job was not found." } });
    return;
  }
  res.json({ data: { jobId: job.id, status: job.status, rowCount: job.rowCount, errorMessage: job.errorMessage, createdAt: job.createdAt, updatedAt: job.updatedAt } });
});

importsRouter.get("/:id", async (req, res) => {
  const record = await prisma.transactionImport.findFirst({
    where: { id: req.params.id, ownerClerkId: req.auth!.userId },
    include: {
      transactions: { orderBy: { occurredAt: "desc" }, take: 100 },
      reviewItems: { orderBy: { rowNumber: "asc" }, take: 100 },
    },
  });
  if (!record) {
    res.status(404).json({ error: { code: "IMPORT_NOT_FOUND", message: "Import was not found." } });
    return;
  }
  res.json({ data: record });
});
