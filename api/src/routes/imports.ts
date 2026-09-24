import { ImportStatus, ImportType, Prisma, ReviewStatus } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { parse } from "csv-parse/sync";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { createUploadUrl, getPrivateObjectBytes, getPrivateObjectText, storePrivateObject } from "../lib/r2.js";
import { parseOfxQfx } from "../imports/ofx.js";
import { extractReceipt, extractStatement, extractStatementReport } from "../providers/gemini.js";
import { categorizeDescriptions } from "../providers/gemini.js";
import { suggestCategory } from "../lib/categorize.js";
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
  const [categories, rules] = await Promise.all([
    prisma.category.findMany({ where: { ownerClerkId, isArchived: false }, select: { id: true, name: true } }),
    prisma.categorizationRule.findMany({ where: { ownerClerkId }, select: { matcher: true, categoryId: true } }),
  ]);
  const suggestCategoryId = (rawDescriptor: string, type: string) =>
    suggestCategory(
      rawDescriptor,
      type,
      categories.map((category) => ({ id: category.id, name: category.name })),
      rules.flatMap((rule) => (rule.categoryId ? [{ matcher: rule.matcher, categoryId: rule.categoryId }] : [])),
    )?.categoryId;
  const keywordMatched = new Set<number>();
  const enriched = prepared.map((item, index) => {
    if (!item.proposedData || typeof item.proposedData !== "object" || Array.isArray(item.proposedData)) return item;
    const proposed = item.proposedData as Record<string, unknown>;
    if (typeof proposed.categoryId === "string") return item;
    const rawDescriptor = typeof proposed.merchant === "string" ? proposed.merchant : typeof proposed.description === "string" ? proposed.description : undefined;
    const categoryId = rawDescriptor ? suggestCategoryId(rawDescriptor, String(proposed.type ?? "")) : undefined;
    const categoryName = categoryId ? categories.find((category) => category.id === categoryId)?.name : undefined;
    if (categoryId) keywordMatched.add(index);
    return categoryId ? { ...item, proposedData: { ...proposed, categoryId, categoryName } as Prisma.InputJsonValue } : item;
  });
  // AI fallback: batch whatever the keyword rules could not match so vague
  // bank-transfer narratives still get a suggestion with honest confidence.
  // Anything left over (or any AI failure) stays uncategorized for review.
  const aiCandidates = enriched
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => {
      if (!item.proposedData || typeof item.proposedData !== "object" || Array.isArray(item.proposedData)) return false;
      const proposed = item.proposedData as Record<string, unknown>;
      if (typeof proposed.categoryId === "string") return false;
      const descriptor = typeof proposed.merchant === "string" ? proposed.merchant : typeof proposed.description === "string" ? proposed.description : undefined;
      return typeof descriptor === "string" && descriptor.trim().length > 0;
    });
  const aiConfidence = new Map<number, number>();
  if (aiCandidates.length > 0) {
    try {
      const names = categories.map((category) => category.name);
      const byIndex = new Map(aiCandidates.map((entry) => [entry.index, entry]));
      for (let offset = 0; offset < aiCandidates.length; offset += 100) {
        const chunk = aiCandidates.slice(offset, offset + 100);
        const suggestions = await categorizeDescriptions(
          chunk.map(({ item, index }) => {
            const proposed = item.proposedData as Record<string, unknown>;
            return {
              index,
              description: String(proposed.merchant ?? proposed.description ?? ""),
              type: String(proposed.type ?? ""),
            };
          }),
          names,
        );
        const byId = new Map(categories.map((category) => [category.name.toLowerCase(), category.id]));
        for (const suggestion of suggestions) {
          const categoryId = byId.get(suggestion.category.toLowerCase());
          const target = byIndex.get(suggestion.index);
          if (!categoryId || !target) continue;
          const proposed = target.item.proposedData as Record<string, unknown>;
          target.item.proposedData = { ...proposed, categoryId, categoryName: suggestion.category } as Prisma.InputJsonValue;
          aiConfidence.set(target.index, suggestion.confidence);
        }
      }
    } catch (error) {
      logger.info({ error: error instanceof Error ? error.message : String(error) }, "AI categorization skipped; leftovers stay in review");
    }
  }
  const fingerprints = enriched.map((item) => item.fingerprint);
  const existing = await prisma.transaction.findMany({ where: { ownerClerkId, fingerprint: { in: fingerprints } }, select: { fingerprint: true } });
  const existingFingerprints = new Set(existing.map((item) => item.fingerprint));
  const reviewItems = enriched.map((item, index) => ({
    ownerClerkId,
    importId: record.id,
    rowNumber: item.rowNumber,
    status: ReviewStatus.PENDING,
    rawData: item.row,
    proposedData: item.proposedData,
    fingerprint: item.fingerprint,
    confidence:
      item.errorMessage || existingFingerprints.has(item.fingerprint)
        ? 0
        : keywordMatched.has(index)
          ? 0.9
          : (aiConfidence.get(index) ?? 0.5),
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

async function processPdfStatement(ownerClerkId: string, record: { id: string; objectKey: string }) {
  const bytes = await getPrivateObjectBytes(record.objectKey);
  const profile = await prisma.profile.findUnique({ where: { clerkId: ownerClerkId }, select: { currency: true } });
  const defaultCurrency = profile?.currency?.toUpperCase() ?? "USD";
  const report = await extractStatementReport({ mimeType: "application/pdf", bytes: bytes.toString("base64") });
  const statementRowSchema = z.object({ date: z.coerce.date(), description: z.string().min(1), amount: z.coerce.number().finite(), balance: z.coerce.number().finite().optional(), page: z.number().int().positive().optional(), currency: z.string().max(12).optional() });
  const parsedRows = report.transactions.flatMap((item) => {
    const parsed = statementRowSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
  const prepared: PreparedReview[] = [];

  if (parsedRows.length > 0) {
    prepared.push(...parsedRows.map((row, index) => ({
      row: { date: row.date.toISOString(), description: row.description, amount: row.amount, balance: row.balance, page: row.page, currency: row.currency ?? defaultCurrency },
      rowNumber: index + 1,
      fingerprint: fingerprintFor(row.date.toISOString(), row.amount, row.description),
      proposedData: { type: row.amount >= 0 ? "INCOME" : "EXPENSE", amount: Math.abs(row.amount), currency: row.currency ?? defaultCurrency, description: row.description, occurredAt: row.date.toISOString() },
    })));
  }

  for (const page of report.failedPages) {
    prepared.push({
      row: { page, needsReview: true, descriptor: `Statement page ${page} could not be parsed` },
      rowNumber: prepared.length + 1,
      fingerprint: fingerprintFor(`page:${page}`, undefined, "PDF statement page needs review"),
      errorMessage: `Page ${page} could not be extracted after three attempts. Please review it manually.`,
    });
  }

  if (prepared.length === 0) {
    prepared.push({ row: { response: JSON.stringify(report) }, rowNumber: 1, fingerprint: fingerprintFor(undefined, undefined, "PDF statement extraction failed"), errorMessage: "No valid transactions were extracted from the bank statement." });
  }
  if (prepared.length > 10_000) throw new Error("PDF statement exceeds the 10,000-row processing limit.");
  logger.info({ importId: record.id, transactionCount: parsedRows.length, failedPages: report.failedPages.length }, "completed PDF bank statement job");
  await persistReviewItems(ownerClerkId, record, prepared);
}

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
  if (record.status === ImportStatus.PROCESSING) {
    res.status(409).json({ error: { code: "IMPORT_ALREADY_PROCESSING", message: "Import is already processing." } });
    return;
  }

  await prisma.transactionImport.update({ where: { id: record.id }, data: { status: ImportStatus.PROCESSING, errorMessage: null } });
  if (record.type === ImportType.CSV && /\.pdf$/i.test(record.originalName ?? "")) {
    void processPdfStatement(ownerClerkId, { id: record.id, objectKey: record.objectKey }).catch(async (error) => {
      logger.error({ importId: record.id, error: error instanceof Error ? error.message : String(error) }, "PDF bank statement job failed");
      await prisma.transactionImport.update({ where: { id: record.id }, data: { status: ImportStatus.FAILED, errorMessage: error instanceof Error ? error.message : "PDF statement processing failed." } });
    });
    res.status(202).json({ data: { importId: record.id, jobId: record.id, status: ImportStatus.PROCESSING } });
    return;
  }
  try {
    const profile = await prisma.profile.findUnique({ where: { clerkId: ownerClerkId }, select: { currency: true } });
    const defaultCurrency = profile?.currency?.toUpperCase() ?? "USD";
    let prepared: PreparedReview[];
    if (record.type === ImportType.CSV && /\.pdf$/i.test(record.originalName ?? "")) {
      const bytes = await getPrivateObjectBytes(record.objectKey);
      const rawResponse = await extractStatement({ mimeType: "application/pdf", bytes: bytes.toString("base64") });
      let statementPayload: unknown;
      try { statementPayload = JSON.parse(rawResponse); } catch { statementPayload = undefined; }
      const parsed = z.array(z.object({ date: z.coerce.date(), description: z.string().min(1), amount: z.coerce.number().finite(), balance: z.coerce.number().finite().optional(), page: z.number().int().positive().optional(), currency: z.string().max(12).optional() })).safeParse(statementPayload);
      if (!parsed.success || parsed.data.length === 0) {
        prepared = [{ row: { response: rawResponse }, rowNumber: 1, fingerprint: fingerprintFor(undefined, undefined, rawResponse), errorMessage: "Bank statement OCR returned no valid transactions." }];
      } else {
        if (parsed.data.length > 10_000) throw new Error("PDF statement exceeds the 10,000-row processing limit.");
        logger.info({ importId: record.id, transactionCount: parsed.data.length }, "parsed PDF bank statement transactions");
        prepared = parsed.data.map((row, index) => ({
          row: { date: row.date.toISOString(), description: row.description, amount: row.amount, balance: row.balance, page: row.page, currency: row.currency },
          rowNumber: index + 1,
          fingerprint: fingerprintFor(row.date.toISOString(), row.amount, row.description),
          proposedData: { type: row.amount >= 0 ? "INCOME" : "EXPENSE", amount: Math.abs(row.amount), description: row.description, occurredAt: row.date.toISOString() },
        }));
      }
    } else if (record.type === ImportType.RECEIPT) {
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
        const currency = item.currency ?? defaultCurrency;
        prepared = [{ row: { merchant: item.merchant, amount: item.amount, currency, occurredAt: date, description }, rowNumber: 1, fingerprint: fingerprintFor(date, -item.amount, description), proposedData: { type: "EXPENSE", amount: item.amount, currency, description, merchant: item.merchant, occurredAt: date } }];
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
