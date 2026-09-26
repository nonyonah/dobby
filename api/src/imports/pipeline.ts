import { ImportStatus, ImportType, Prisma, ReviewStatus } from "@prisma/client";
import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import { read as readWorkbook, utils as xlsxUtils } from "xlsx";
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
  // Amount cells may carry symbols/codes ("₦92,133.50", "NGN 1,440.00", "(25.00)").
  const parsed = Number(value.replace(/^[A-Za-z]{3}\s?/, "").replace(/[$₦£€₵,\s]/g, "").replace(/^\((.*)\)$/, "-$1"));
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
    const dateText = valueFor(row, ["date", "transactiondate", "posteddate", "occurredat", "valuedate", "transdate", "trandate", "effectivedate", "bookingdate"]);
    const description = valueFor(row, ["description", "name", "memo", "payee", "merchant", "narration", "remarks", "particulars", "details", "transactiondetails"]);
    const amount = parseAmount(valueFor(row, ["amount", "total", "value", "transactionamount", "netamount"]));
    const debit = parseAmount(valueFor(row, ["debit", "withdrawal", "debitamount", "withdrawals", "withdrawalamount", "moneyout", "paidout", "payments"]));
    const credit = parseAmount(valueFor(row, ["credit", "deposit", "creditamount", "deposits", "depositamount", "moneyin", "received", "paidin"]));
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

/** GTB-style spreadsheets carry the type CSV and an .xls/.xlsx filename. */
export function isExcelImport(record: { type: string; originalName: string | null }) {
  return record.type === ImportType.CSV && /\.xlsx?$/i.test(record.originalName ?? "");
}

/** Normalized header names that mark a transaction table (incl. GTB layouts). */
const EXCEL_HEADER_ALIASES = new Set([
  "date", "transactiondate", "posteddate", "occurredat", "valuedate", "transdate", "trandate", "effectivedate", "bookingdate",
  "description", "name", "memo", "payee", "merchant", "narration", "remarks", "particulars", "details", "transactiondetails",
  "amount", "total", "value", "transactionamount", "netamount",
  "debit", "withdrawal", "debitamount", "withdrawals", "withdrawalamount", "moneyout", "paidout", "payments",
  "credit", "deposit", "creditamount", "deposits", "depositamount", "moneyin", "received", "paidin",
  "balance", "runningbalance", "availablebalance", "ref", "reference", "type", "drcr",
]);

/** Single amount column plus a DR/CR indicator column (some GTB exports). */
const DRCR_COLUMNS = new Set(["drcr", "drorcr", "type", "txntype", "transactiontype", "side", "direction", "creditdebit", "debitorcredit", "dc", "sign"]);
const DEBIT_TOKEN = /^(dr|d|debit|debits|withdrawal|wdr|out|payment|paid)$/i;
const AMOUNT_KEYS = new Set([
  "amount", "total", "value", "transactionamount", "netamount",
  "debit", "withdrawal", "debitamount", "withdrawals", "withdrawalamount", "moneyout", "paidout", "payments",
  "credit", "deposit", "creditamount", "deposits", "depositamount", "moneyin", "received", "paidin",
]);

function excelCellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return "";
  return String(value).trim();
}

export async function processExcelStatement(ownerClerkId: string, record: { id: string; objectKey: string }) {
  const bytes = await getPrivateObjectBytes(record.objectKey);
  const { rows, sheetName } = excelToStatementRows(bytes);
  const prepared = prepareStatementRows(rows);
  logger.info({ importId: record.id, sheet: sheetName, transactionCount: prepared.length }, "completed Excel bank statement job");
  await persistReviewItems(ownerClerkId, record, prepared);
}

/**
 * Pure spreadsheet → statement records: first sheet, header-row detection
 * (title/account rows above the table are skipped), DR/CR folding, empty-row
 * skipping. Throws when the sheet has no usable table.
 */
export function excelToStatementRows(bytes: Buffer): { rows: Record<string, string>[]; sheetName: string } {
  const workbook = readWorkbook(bytes, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0] ?? "";
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) throw new Error("The spreadsheet has no worksheets.");
  const grid = xlsxUtils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null, blankrows: false });
  if (grid.length === 0) throw new Error("The spreadsheet is empty.");

  // Title/account rows sit above the table — scan for the first row that
  // looks like headers (at least two known columns).
  let headerIndex = -1;
  for (let index = 0; index < Math.min(grid.length, 25); index += 1) {
    const cells = (grid[index] ?? []).map(excelCellToString);
    if (cells.filter((cell) => EXCEL_HEADER_ALIASES.has(normalizeKey(cell))).length >= 2) {
      headerIndex = index;
      break;
    }
  }
  if (headerIndex === -1) throw new Error("Could not find a header row (Date / Description / Amount) in the spreadsheet.");
  const headers = (grid[headerIndex] ?? []).map(excelCellToString);
  const drcrIndex = headers.findIndex((header) => DRCR_COLUMNS.has(normalizeKey(header)));

  const rows: Record<string, string>[] = [];
  for (const line of grid.slice(headerIndex + 1)) {
    const cells = (line ?? []).map(excelCellToString);
    const entry: Record<string, string> = {};
    headers.forEach((header, column) => {
      if (header) entry[header] = cells[column] ?? "";
    });
    if (Object.values(entry).every((value) => !value)) continue;
    // Fold a DR/CR indicator into a single amount column.
    if (drcrIndex >= 0 && DEBIT_TOKEN.test(cells[drcrIndex] ?? "")) {
      const key = Object.keys(entry).find((candidate) => AMOUNT_KEYS.has(normalizeKey(candidate)) && (entry[candidate] ?? "") !== "");
      if (key) {
        const magnitude = Math.abs(Number((entry[key] ?? "").replace(/[^0-9.\-]/g, "")));
        if (Number.isFinite(magnitude) && magnitude > 0) entry[key] = `-${magnitude}`;
      }
    }
    rows.push(entry);
  }
  if (rows.length === 0) throw new Error("The spreadsheet has no data rows under its header.");
  if (rows.length > 10_000) throw new Error("Statement exceeds the 10,000-row processing limit.");
  return { rows, sheetName };
}

export async function processPdfStatement(ownerClerkId: string, record: { id: string; objectKey: string; originalName?: string | null }) {
  const bytes = await getPrivateObjectBytes(record.objectKey);
  const profile = await prisma.profile.findUnique({ where: { clerkId: ownerClerkId }, select: { currency: true } });
  const defaultCurrency = profile?.currency?.toUpperCase() ?? "USD";
  const report = await extractStatementReport({ mimeType: "application/pdf", bytes: bytes.toString("base64") });
  if (report.encrypted) {
    // A locked PDF lands in the review queue with a plain-language message,
    // which is also what feeds the dashboard attention card and the bell —
    // so the user is told exactly what to do. Dobby never asks for the
    // password itself.
    await persistReviewItems(ownerClerkId, record, [{
      row: { filename: record.originalName ?? "statement.pdf", needsPassword: true },
      rowNumber: 1,
      fingerprint: fingerprintFor(record.objectKey, undefined, "password-protected statement"),
      errorMessage:
        "This statement is password-protected, so nothing could be read. Unlock it in your bank app (or print it to a new PDF) and import the unlocked copy.",
    }]);
    logger.info({ importId: record.id }, "password-protected statement queued for the user");
    return;
  }
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
 * PDF statements run through the async extractor, Excel statements through
 * the sheet reader; everything else is synchronous.
 */
export async function processImportRecord(
  ownerClerkId: string,
  record: { id: string; objectKey: string; type: string; originalName: string | null },
): Promise<{ rowCount: number; reviewCount: number }> {
  if (isPdfImport(record) || isExcelImport(record)) {
    if (isPdfImport(record)) await processPdfStatement(ownerClerkId, { id: record.id, objectKey: record.objectKey, originalName: record.originalName });
    else await processExcelStatement(ownerClerkId, { id: record.id, objectKey: record.objectKey });
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
