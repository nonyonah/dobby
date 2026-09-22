import { ImportStatus, ImportType, Prisma, ReviewStatus } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { parse } from "csv-parse/sync";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { createCsvUploadUrl, getPrivateObjectText } from "../lib/r2.js";
import { requireAuth } from "../middleware/auth.js";

export const importsRouter = Router();
importsRouter.use(requireAuth);

const presignSchema = z.object({
  originalName: z.string().trim().min(1).max(255),
  contentType: z.enum(["text/csv", "text/plain", "application/vnd.ms-excel"]),
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
  const extension = input.originalName.toLowerCase().endsWith(".txt") ? "txt" : "csv";
  const id = randomUUID();
  const objectKey = `users/${req.auth!.userId}/imports/${id}.${extension}`;
  const uploadUrl = await createCsvUploadUrl(objectKey, input.contentType);
  const record = await prisma.transactionImport.create({
    data: {
      ownerClerkId: req.auth!.userId,
      type: ImportType.CSV,
      status: "CREATED",
      objectKey,
      originalName: input.originalName,
    },
  });

  res.status(201).json({ data: { import: record, uploadUrl, expiresInSeconds: 900 } });
});

importsRouter.post("/:id/process", async (req, res) => {
  const record = await prisma.transactionImport.findFirst({
    where: { id: req.params.id, ownerClerkId: req.auth!.userId },
  });
  if (!record) {
    res.status(404).json({ error: { code: "IMPORT_NOT_FOUND", message: "Import was not found." } });
    return;
  }
  if (!record.objectKey) {
    res.status(400).json({ error: { code: "IMPORT_FILE_MISSING", message: "Import has no stored file." } });
    return;
  }
  if (record.status === ImportStatus.PROCESSING) {
    res.status(409).json({ error: { code: "IMPORT_ALREADY_PROCESSING", message: "Import is already processing." } });
    return;
  }

  await prisma.transactionImport.update({ where: { id: record.id }, data: { status: ImportStatus.PROCESSING, errorMessage: null } });
  try {
    const csv = await getPrivateObjectText(record.objectKey);
    const rows = parse<Record<string, string>>(csv, { columns: true, skip_empty_lines: true, bom: true, relax_column_count: true });
    if (rows.length > 10_000) throw new Error("CSV exceeds the 10,000-row processing limit.");

    const normalizeKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
    const valueFor = (row: Record<string, string>, names: string[]) => {
      const entries = Object.entries(row);
      const match = entries.find(([key]) => names.includes(normalizeKey(key)));
      return match?.[1]?.trim() || undefined;
    };
    const parseAmount = (value?: string) => {
      if (!value) return undefined;
      const parsed = Number(value.replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1"));
      return Number.isFinite(parsed) && parsed !== 0 ? parsed : undefined;
    };
    const parseDate = (value?: string) => {
      if (!value) return undefined;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? undefined : date;
    };

    const prepared = rows.map((row, index) => {
      const dateText = valueFor(row, ["date", "transactiondate", "posteddate", "occurredat"]);
      const description = valueFor(row, ["description", "name", "memo", "payee", "merchant"]);
      const amount = parseAmount(valueFor(row, ["amount", "total", "value", "transactionamount"]));
      const debit = parseAmount(valueFor(row, ["debit", "withdrawal"]));
      const credit = parseAmount(valueFor(row, ["credit", "deposit"]));
      const signedAmount = amount ?? (credit ? Math.abs(credit) : debit ? -Math.abs(debit) : undefined);
      const occurredAt = parseDate(dateText);
      const fingerprintSource = [dateText ?? "", signedAmount ?? "", description ?? ""].join("|").toLowerCase();
      const fingerprint = createHash("sha256").update(fingerprintSource).digest("hex");
      const errorMessage = !occurredAt || !description || signedAmount === undefined ? "Date, description, and a non-zero amount are required." : undefined;
      const proposedData = !errorMessage && occurredAt && description && signedAmount !== undefined
        ? { type: signedAmount >= 0 ? "INCOME" : "EXPENSE", amount: Math.abs(signedAmount), description, occurredAt: occurredAt.toISOString() }
        : undefined;
      return { row, rowNumber: index + 2, fingerprint, errorMessage, proposedData };
    });

    const fingerprints = prepared.map((item) => item.fingerprint);
    const existing = await prisma.transaction.findMany({ where: { ownerClerkId: req.auth!.userId, fingerprint: { in: fingerprints } }, select: { fingerprint: true } });
    const existingFingerprints = new Set(existing.map((item) => item.fingerprint));
    const reviewItems = prepared.map((item) => ({
      ownerClerkId: req.auth!.userId,
      importId: record.id,
      rowNumber: item.rowNumber,
      status: ReviewStatus.PENDING,
      rawData: item.row as Prisma.InputJsonValue,
      proposedData: item.proposedData as Prisma.InputJsonValue | undefined,
      fingerprint: item.fingerprint,
      confidence: item.errorMessage || existingFingerprints.has(item.fingerprint) ? 0 : 0.9,
      errorMessage: item.errorMessage ?? (existingFingerprints.has(item.fingerprint) ? "Duplicate transaction fingerprint." : null),
    }));

    await prisma.$transaction([
      prisma.transactionReviewItem.deleteMany({ where: { importId: record.id, ownerClerkId: req.auth!.userId } }),
      prisma.transactionReviewItem.createMany({ data: reviewItems }),
      prisma.transactionImport.update({ where: { id: record.id }, data: { status: ImportStatus.REVIEW, rowCount: rows.length } }),
    ]);
    res.json({ data: { importId: record.id, rowCount: rows.length, reviewCount: reviewItems.length } });
  } catch (error) {
    await prisma.transactionImport.update({ where: { id: record.id }, data: { status: ImportStatus.FAILED, errorMessage: error instanceof Error ? error.message : "Import processing failed." } });
    throw error;
  }
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
