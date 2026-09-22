import { ImportStatus, ImportType, Prisma, ReviewStatus } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { parse } from "csv-parse/sync";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { createUploadUrl, getPrivateObjectBytes, getPrivateObjectText } from "../lib/r2.js";
import { parseOfxQfx } from "../imports/ofx.js";
import { extractReceipt } from "../providers/gemini.js";
import { requireAuth } from "../middleware/auth.js";

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

type PreparedReview = {
  row: Prisma.InputJsonValue;
  rowNumber: number;
  fingerprint: string;
  errorMessage?: string;
  proposedData?: Prisma.InputJsonValue;
};

function fingerprintFor(date: string | undefined, amount: number | undefined, description: string | undefined) {
  return createHash("sha256").update([date ?? "", amount ?? "", description ?? ""].join("|").toLowerCase()).digest("hex");
}

async function persistReviewItems(ownerClerkId: string, record: { id: string }, prepared: PreparedReview[]) {
  const fingerprints = prepared.map((item) => item.fingerprint);
  const existing = await prisma.transaction.findMany({ where: { ownerClerkId, fingerprint: { in: fingerprints } }, select: { fingerprint: true } });
  const existingFingerprints = new Set(existing.map((item) => item.fingerprint));
  const reviewItems = prepared.map((item) => ({
    ownerClerkId,
    importId: record.id,
    rowNumber: item.rowNumber,
    status: ReviewStatus.PENDING,
    rawData: item.row,
    proposedData: item.proposedData,
    fingerprint: item.fingerprint,
    confidence: item.errorMessage || existingFingerprints.has(item.fingerprint) ? 0 : 0.9,
    errorMessage: item.errorMessage ?? (existingFingerprints.has(item.fingerprint) ? "Duplicate transaction fingerprint." : null),
  }));

  await prisma.$transaction([
    prisma.transactionReviewItem.deleteMany({ where: { importId: record.id, ownerClerkId } }),
    prisma.transactionReviewItem.createMany({ data: reviewItems }),
    prisma.transactionImport.update({ where: { id: record.id }, data: { status: ImportStatus.REVIEW, rowCount: prepared.length } }),
  ]);
  return reviewItems.length;
}

function normalizeKey(value: string) { return value.toLowerCase().replace(/[^a-z0-9]/g, ""); }
function parseAmount(value?: string) {
  if (!value) return undefined;
  const parsed = Number(value.replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1"));
  return Number.isFinite(parsed) && parsed !== 0 ? parsed : undefined;
}
function parseDate(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function prepareStatementRows(rows: Record<string, string>[], rowOffset = 2): PreparedReview[] {
  const valueFor = (row: Record<string, string>, names: string[]) => Object.entries(row).find(([key]) => names.includes(normalizeKey(key)))?.[1]?.trim() || undefined;
  return rows.map((row, index) => {
    const dateText = valueFor(row, ["date", "transactiondate", "posteddate", "occurredat"]);
    const description = valueFor(row, ["description", "name", "memo", "payee", "merchant"]);
    const amount = parseAmount(valueFor(row, ["amount", "total", "value", "transactionamount"]));
    const debit = parseAmount(valueFor(row, ["debit", "withdrawal"]));
    const credit = parseAmount(valueFor(row, ["credit", "deposit"]));
    const signedAmount = amount ?? (credit ? Math.abs(credit) : debit ? -Math.abs(debit) : undefined);
    const occurredAt = parseDate(dateText);
    const errorMessage = !occurredAt || !description || signedAmount === undefined ? "Date, description, and a non-zero amount are required." : undefined;
    return {
      row: row as Prisma.InputJsonValue,
      rowNumber: index + rowOffset,
      fingerprint: fingerprintFor(dateText, signedAmount, description),
      errorMessage,
      proposedData: !errorMessage && occurredAt && description && signedAmount !== undefined
        ? { type: signedAmount >= 0 ? "INCOME" : "EXPENSE", amount: Math.abs(signedAmount), description, occurredAt: occurredAt.toISOString() }
        : undefined,
    };
  });
}

function receiptMimeType(name: string) {
  const extension = name.split(".").pop()?.toLowerCase();
  return extension === "pdf" ? "application/pdf" : extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg";
}

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
  if (record.status === ImportStatus.PROCESSING) {
    res.status(409).json({ error: { code: "IMPORT_ALREADY_PROCESSING", message: "Import is already processing." } });
    return;
  }

  await prisma.transactionImport.update({ where: { id: record.id }, data: { status: ImportStatus.PROCESSING, errorMessage: null } });
  try {
    let prepared: PreparedReview[];
    if (record.type === ImportType.RECEIPT) {
      const bytes = await getPrivateObjectBytes(record.objectKey);
      const rawResponse = await extractReceipt({ mimeType: receiptMimeType(record.originalName ?? "receipt.jpg"), bytes: bytes.toString("base64") });
      let receiptPayload: unknown;
      try {
        receiptPayload = JSON.parse(rawResponse);
      } catch {
        receiptPayload = undefined;
      }
      const parsed = z.object({ merchant: z.string().min(1).optional(), amount: z.coerce.number().positive(), currency: z.string().max(12).optional(), occurredAt: z.coerce.date(), description: z.string().min(1).optional() }).safeParse(receiptPayload);
      if (!parsed.success) {
        prepared = [{ row: { response: rawResponse }, rowNumber: 1, fingerprint: fingerprintFor(undefined, undefined, rawResponse), errorMessage: "Receipt OCR returned invalid data. Please edit the receipt details manually." }];
      } else {
        const item = parsed.data;
        const description = item.description ?? item.merchant ?? "Receipt";
        const date = item.occurredAt.toISOString();
        prepared = [{ row: { merchant: item.merchant, amount: item.amount, currency: item.currency, occurredAt: date, description }, rowNumber: 1, fingerprint: fingerprintFor(date, -item.amount, description), proposedData: { type: "EXPENSE", amount: item.amount, description, merchant: item.merchant, occurredAt: date } }];
      }
    } else if (record.type === ImportType.OFX || record.type === ImportType.QFX) {
      const statement = await getPrivateObjectText(record.objectKey);
      const rows = parseOfxQfx(statement);
      if (rows.length > 10_000) throw new Error("Statement exceeds the 10,000-row processing limit.");
      prepared = rows.map((row, index) => ({
        row: { externalId: row.externalId, occurredAt: row.occurredAt.toISOString(), amount: row.amount, description: row.description, type: row.type },
        rowNumber: index + 1,
        fingerprint: fingerprintFor(row.occurredAt.toISOString(), row.type === "INCOME" ? row.amount : -row.amount, row.description),
        proposedData: { type: row.type, amount: row.amount, description: row.description, occurredAt: row.occurredAt.toISOString() },
      }));
      if (prepared.length === 0) throw new Error("No valid transactions were found in the OFX/QFX file.");
    } else {
      const csv = await getPrivateObjectText(record.objectKey);
      const rows = parse<Record<string, string>>(csv, { columns: true, skip_empty_lines: true, bom: true, relax_column_count: true });
      if (rows.length > 10_000) throw new Error("CSV exceeds the 10,000-row processing limit.");
      prepared = prepareStatementRows(rows);
    }

    const reviewCount = await persistReviewItems(ownerClerkId, record, prepared);
    res.json({ data: { importId: record.id, rowCount: prepared.length, reviewCount } });
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
