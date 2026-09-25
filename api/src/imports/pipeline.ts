import { ImportStatus, ImportType, Prisma, ReviewStatus } from "@prisma/client";
import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { getPrivateObjectBytes, getPrivateObjectText } from "../lib/r2.js";
import { parseOfxQfx } from "./ofx.js";
import { categorizeDescriptions, extractReceipt, extractStatementReport } from "../providers/gemini.js";
import { suggestCategory } from "../lib/categorize.js";
import { logger } from "../lib/logger.js";

/**
 * Shared import pipeline: turns a stored file (or a set of prepared rows) into
 * PENDING review items. Used by the file-upload routes and by the email importer.
 */

export type PreparedReview = {
  row: Prisma.InputJsonValue;
  rowNumber: number;
  fingerprint: string;
  errorMessage?: string;
  proposedData?: Prisma.InputJsonValue;
};

export function fingerprintFor(date: string | undefined, amount: number | undefined, description: string | undefined) {
  return createHash("sha256").update([date ?? "", amount ?? "", description ?? ""].join("|").toLowerCase()).digest("hex");
}

export async function persistReviewItems(ownerClerkId: string, record: { id: string }, prepared: PreparedReview[]) {
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
  // Copilot-style cold start: automated predictions only kick in after the
  // user has manually reviewed 30 transactions. Keyword and custom rules
  // always run; anything below the threshold stays in review instead.
  const reviewedCount = await prisma.transactionReviewItem.count({
    where: { ownerClerkId, status: { in: [ReviewStatus.APPROVED, ReviewStatus.REJECTED] } },
  });
  const aiUnlocked = reviewedCount >= 30;
  if (aiCandidates.length > 0 && !aiUnlocked) {
    logger.info({ reviewedCount }, "AI categorization locked until 30 manual reviews are completed");
  }
  if (aiCandidates.length > 0 && aiUnlocked) {
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
  return {
    count: reviewItems.length,
    duplicateRows: reviewItems.filter((item) => item.errorMessage === "Duplicate transaction fingerprint.").length,
  };
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

export function prepareStatementRows(rows: Record<string, string>[], rowOffset = 2): PreparedReview[] {
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

export function receiptMimeType(name: string) {
  const extension = name.split(".").pop()?.toLowerCase();
  return extension === "pdf" ? "application/pdf" : extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg";
}

/** PDF statements carry the type CSV and a .pdf filename — they run the async path. */
export function isPdfImport(record: { type: string; originalName: string | null }) {
  return record.type === ImportType.CSV && /\.pdf$/i.test(record.originalName ?? "");
}

export async function processPdfStatement(ownerClerkId: string, record: { id: string; objectKey: string }) {
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

/**
 * Parse an already-stored import file and write its review items.
 * PDF statements run through the async extractor; everything else is synchronous.
 */
export async function processImportRecord(
  ownerClerkId: string,
  record: { id: string; objectKey: string; type: string; originalName: string | null },
): Promise<{ rowCount: number; reviewCount: number }> {
  if (isPdfImport(record)) {
    await processPdfStatement(ownerClerkId, { id: record.id, objectKey: record.objectKey });
    const saved = await prisma.transactionImport.findUnique({ where: { id: record.id }, select: { rowCount: true } });
    const reviewCount = await prisma.transactionReviewItem.count({ where: { importId: record.id, ownerClerkId } });
    return { rowCount: saved?.rowCount ?? reviewCount, reviewCount };
  }

  const profile = await prisma.profile.findUnique({ where: { clerkId: ownerClerkId }, select: { currency: true } });
  const defaultCurrency = profile?.currency?.toUpperCase() ?? "USD";
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

  const { count } = await persistReviewItems(ownerClerkId, record, prepared);
  return { rowCount: prepared.length, reviewCount: count };
}

/** Rows of an import that duplicate a transaction already in the ledger. */
export async function countDuplicateRows(ownerClerkId: string, importId: string) {
  return prisma.transactionReviewItem.count({
    where: { ownerClerkId, importId, errorMessage: "Duplicate transaction fingerprint." },
  });
}
