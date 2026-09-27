import { ImportType } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { storePrivateObject } from "../lib/r2.js";
import { persistReviewItems, countDuplicateRows, processImportRecord, type PreparedReview } from "../imports/pipeline.js";
import { extractBankAlert } from "../providers/gemini.js";
import { AppError } from "../middleware/errors.js";
import { logger } from "../lib/logger.js";
import { classifyEmail, extensionKind } from "./classify.js";
import { loadSenderDirectory, describeSender, type SenderDirectory } from "./bank-directory.js";
import { preparsedAlert } from "./alerts.js";
import { EmailProviderClient, type EmailProvider, type RawAttachment, type RawMessage } from "./providers.js";

/** Cap per run so one inbox cannot turn a sync into a marathon. */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 40;
const DEFAULT_LOOKBACK_DAYS = 365;
const MAX_LOOKBACK_DAYS = 730;

export type SyncOptions = { lookbackDays?: number; limit?: number };

export type SyncCounts = {
  scanned: number;
  imported: number;
  duplicates: number;
  duplicateRows: number;
  skipped: number;
  failed: number;
};

const ATTACHMENT_PRIORITY: Record<"statement" | "receipt", string[]> = {
  // Deterministic formats beat OCR when a bank sends both.
  statement: ["csv", "ofx", "qfx", "txt", "pdf", "xls", "xlsx"],
  receipt: ["jpg", "jpeg", "png", "webp", "pdf"],
};

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "attachment";
  return base.replace(/[^\w.\- ]+/g, "_").slice(0, 200) || "attachment";
}

function pickAttachment(attachments: RawAttachment[], kind: "statement" | "receipt"): RawAttachment | undefined {
  const ranked = [...attachments].sort((a, b) => rank(a, kind) - rank(b, kind));
  return ranked[0];
  function rank(attachment: RawAttachment, target: "statement" | "receipt") {
    const extension = extensionKind(attachment.filename);
    const priority = ATTACHMENT_PRIORITY[target];
    const extensionName = attachment.filename.split(".").pop()?.toLowerCase() ?? "";
    const index = priority.indexOf(extensionName);
    const score = index === -1 ? priority.length : index;
    // Prefer files whose extension matches the kind we classified the email as.
    return (extension === target ? 0 : 1) * priority.length + score;
  }
}

function importTypeFor(filename: string): { type: ImportType; contentType: string } {
  const extension = (filename.split(".").pop() ?? "").toLowerCase();
  if (extension === "ofx") return { type: ImportType.OFX, contentType: "application/ofx" };
  if (extension === "qfx") return { type: ImportType.QFX, contentType: "application/qfx" };
  if (extension === "xls") return { type: ImportType.CSV, contentType: "application/vnd.ms-excel" };
  if (extension === "xlsx") return { type: ImportType.CSV, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
  if (extension === "jpg" || extension === "jpeg" || extension === "png" || extension === "webp") {
    return {
      type: ImportType.RECEIPT,
      contentType: extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg",
    };
  }
  if (extension === "pdf") return { type: ImportType.CSV, contentType: "application/pdf" };
  return { type: ImportType.CSV, contentType: "text/csv" };
}

async function recordEmailImport(fields: {
  ownerClerkId: string;
  provider: EmailProvider;
  messageId: string;
  subject?: string;
  fromAddress?: string;
  receivedAt?: Date;
  kind: string;
  contentHash?: string;
  status: "imported" | "duplicate" | "skipped" | "failed";
  detail?: string;
  importId?: string;
}) {
  const where = { ownerClerkId_provider_messageId: { ownerClerkId: fields.ownerClerkId, provider: fields.provider, messageId: fields.messageId } };
  const data = {
    subject: fields.subject?.slice(0, 500) ?? null,
    fromAddress: fields.fromAddress?.slice(0, 320) ?? null,
    receivedAt: fields.receivedAt ?? null,
    kind: fields.kind,
    contentHash: fields.contentHash ?? "",
    status: fields.status,
    detail: fields.detail?.slice(0, 500) ?? null,
    importId: fields.importId ?? null,
  };
  try {
    await prisma.emailImport.upsert({ where, create: { ownerClerkId: fields.ownerClerkId, provider: fields.provider, messageId: fields.messageId, ...data }, update: data });
  } catch (error) {
    logger.warn({ error: error instanceof Error ? error.message : String(error), messageId: fields.messageId }, "could not record email import row");
  }
}

/**
 * Scan a mailbox for statements, receipts, and credit/debit alerts, import the
 * ones we have not seen before, and report duplicates instead of re-importing.
 */
export async function runEmailSync(ownerClerkId: string, provider: EmailProvider, jobId: string, options: SyncOptions = {}): Promise<SyncCounts> {
  const lookbackDays = Math.min(Math.max(options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS, 1), MAX_LOOKBACK_DAYS);
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const counts: SyncCounts = { scanned: 0, imported: 0, duplicates: 0, duplicateRows: 0, skipped: 0, failed: 0 };
  const alertRows: PreparedReview[] = [];

  const adapter = new EmailProviderClient(provider, ownerClerkId);
  // Sender directory (banks + merchants) is loaded once per run and shared by
  // every classification; a missing table degrades to regex-only matching.
  const directory = await loadSenderDirectory();

  const saveJob = () =>
    prisma.emailSyncJob.update({ where: { id: jobId }, data: { ...counts } }).catch(() => undefined);

  // Walk the lookback newest-first in 30-day windows so a deep history never
  // buries this month's statements under a year of newsletters. Windows are
  // non-overlapping; the seen-set guards the boundary seconds.
  const seenIds = new Set<string>();
  const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
  const now = new Date();
  for (let windowEnd = now; windowEnd > since && counts.scanned < limit; windowEnd = new Date(windowEnd.getTime() - WINDOW_MS)) {
    const windowStart = new Date(Math.max(since.getTime(), windowEnd.getTime() - WINDOW_MS));
    const messages = await adapter.search(windowStart, limit - counts.scanned, windowEnd);

  for (const message of messages) {
    if (seenIds.has(message.id)) continue;
    seenIds.add(message.id);
    counts.scanned += 1;
    // Heartbeat per message start (not just per completed message) so the
    // job row — and its updatedAt — stays live through multi-minute PDFs.
    await saveJob();
    try {
      const previous = await prisma.emailImport.findUnique({
        where: { ownerClerkId_provider_messageId: { ownerClerkId, provider, messageId: message.id } },
      });
      if (previous && (previous.status === "imported" || previous.status === "duplicate")) {
        counts.duplicates += 1;
        await saveJob();
        continue;
      }

      const full = await adapter.hydrate(message);
      const kind = classifyEmail({
        subject: full.subject,
        from: full.from,
        body: full.body ?? full.snippet,
        filenames: full.attachments.map((attachment) => attachment.filename),
        directory,
      });
      if (kind === "none") {
        counts.skipped += 1;
        await saveJob();
        continue;
      }

      if (kind === "alert") {
        const queued = await importAlert(ownerClerkId, provider, full, alertRows, directory);
        if (queued) counts.imported += 1;
        else counts.duplicates += 1;
        await saveJob();
        continue;
      }

      const attachment = pickAttachment(full.attachments, kind);
      if (!attachment) {
        counts.skipped += 1;
        // Link-only receipts (Amazon-style: the email links the receipt
        // instead of attaching it) still get a record that says what to do.
        if (kind === "receipt") {
          const attribution = describeSender(full.from, full.subject, directory);
          await recordEmailImport({
            ownerClerkId,
            provider,
            messageId: full.id,
            subject: full.subject,
            fromAddress: full.from,
            receivedAt: full.receivedAt,
            kind,
            status: "skipped",
            detail: attribution.merchant
              ? `${attribution.merchant} sent this receipt as a link, not a file — open the email to view it, or import a PDF copy.`
              : "This receipt has no downloadable file — open the email to view it.",
          });
        }
        await saveJob();
        continue;
      }

      const file = await adapter.download(full, attachment);
      const contentHash = sha256(file.bytes);
      const sameFile = await prisma.emailImport.findFirst({
        where: { ownerClerkId, contentHash, status: { in: ["imported", "duplicate"] }, NOT: { messageId: full.id } },
        orderBy: { createdAt: "desc" },
        select: { subject: true, receivedAt: true },
      });
      if (sameFile) {
        counts.duplicates += 1;
        await recordEmailImport({
          ownerClerkId,
          provider,
          messageId: full.id,
          subject: full.subject,
          fromAddress: full.from,
          receivedAt: full.receivedAt,
          kind,
          contentHash,
          status: "duplicate",
          detail: `Same file already imported${sameFile.subject ? ` from "${sameFile.subject}"` : ""}`,
        });
        await saveJob();
        continue;
      }

      const importId = await storeAttachment(ownerClerkId, file.filename, file.mimeType, file.bytes);
      const duplicateRows = await countDuplicateRows(ownerClerkId, importId);
      const totalRows = await prisma.transactionReviewItem.count({ where: { ownerClerkId, importId } });
      // A statement or receipt whose every row already exists is a duplicate
      // artifact, not a new import — that is what the user needs to be told.
      const fullyDuplicate = totalRows > 0 && duplicateRows === totalRows;
      if (fullyDuplicate) counts.duplicates += 1;
      else counts.imported += 1;
      counts.duplicateRows += duplicateRows;
      await recordEmailImport({
        ownerClerkId,
        provider,
        messageId: full.id,
        subject: full.subject,
        fromAddress: full.from,
        receivedAt: full.receivedAt,
        kind,
        contentHash,
        status: fullyDuplicate ? "duplicate" : "imported",
        detail: fullyDuplicate
          ? `All ${totalRows} row${totalRows === 1 ? "" : "s"} already exist in your ledger.`
          : duplicateRows > 0
            ? `${duplicateRows} of ${totalRows} rows duplicate existing transactions.`
            : undefined,
        importId,
      });
      await saveJob();
    } catch (error) {
      counts.failed += 1;
      const message_ = error instanceof Error ? error.message : String(error);
      logger.warn({ provider, messageId: message.id, error: message_ }, "email import failed for one message");
      await recordEmailImport({
        ownerClerkId,
        provider,
        messageId: message.id,
        subject: message.subject,
        fromAddress: message.from,
        receivedAt: message.receivedAt,
        kind: "other",
        status: "failed",
        detail: message_.slice(0, 400),
      });
      await saveJob();
    }
  }
  }

  if (alertRows.length > 0) {
    try {
      const alertImport = await prisma.transactionImport.create({
        data: {
          ownerClerkId,
          type: ImportType.CSV,
          status: "PROCESSING",
          originalName: `Bank alerts from ${provider === "gmail" ? "Gmail" : "Outlook"} (${new Date().toISOString().slice(0, 10)})`,
        },
      });
      const { duplicateRows } = await persistReviewItems(ownerClerkId, alertImport, alertRows);
      counts.duplicateRows += duplicateRows;
    } catch (error) {
      counts.failed += alertRows.length;
      counts.imported = Math.max(0, counts.imported - alertRows.length);
      logger.error({ error: error instanceof Error ? error.message : String(error) }, "could not persist alert-email transactions");
    }
  }

  return counts;
}

/** Download a file, store it in R2, and run it through the normal import pipeline. */
async function storeAttachment(ownerClerkId: string, filename: string, contentType: string, bytes: Buffer): Promise<string> {
  const name = safeFilename(filename);
  const { type, contentType: detectedType } = importTypeFor(name);
  const extension = (name.split(".").pop() ?? "bin").toLowerCase();
  const objectKey = `users/${ownerClerkId}/imports/${randomUUID()}.${extension}`;
  await storePrivateObject(objectKey, contentType || detectedType, bytes);
  const record = await prisma.transactionImport.create({
    data: { ownerClerkId, type, status: "PROCESSING", objectKey, originalName: name },
  });
  try {
    await processImportRecord(ownerClerkId, { id: record.id, objectKey, type, originalName: name });
  } catch (error) {
    await prisma.transactionImport.update({
      where: { id: record.id },
      data: { status: "FAILED", errorMessage: error instanceof Error ? error.message : "Import processing failed." },
    });
    throw error;
  }
  return record.id;
}

/** Queue a parsed alert row; all alert rows are persisted as one import at the end of the run. Returns false when the alert is already in the ledger. */
async function importAlert(ownerClerkId: string, provider: EmailProvider, message: RawMessage, rows: PreparedReview[], directory?: SenderDirectory): Promise<boolean> {
  const attribution = directory ? describeSender(message.from, message.subject, directory) : {};
  let extraction: {
    type: "INCOME" | "EXPENSE";
    amount: number;
    currency?: string;
    occurredAt: string;
    description: string;
    merchant?: string;
  };
  // Deterministic grammars first (free and exact); the LLM only sees residue.
  const pre = preparsedAlert({ subject: message.subject, from: message.from, body: message.body ?? message.snippet });
  if (pre) {
    extraction = {
      ...pre,
      occurredAt: message.receivedAt?.toISOString() ?? new Date().toISOString(),
      ...(attribution.merchant ? { merchant: attribution.merchant } : {}),
    };
  } else {
    try {
      const ai = await extractBankAlert({ subject: message.subject, from: message.from, body: message.body ?? message.snippet });
      extraction = { ...ai, merchant: ai.merchant ?? attribution.merchant };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Could not read this alert email.";
      await recordEmailImport({
        ownerClerkId,
        provider,
        messageId: message.id,
        subject: message.subject,
        fromAddress: message.from,
        receivedAt: message.receivedAt,
        kind: "alert",
        status: "failed",
        detail: reason,
      });
      throw error;
    }
  }

  const label = extraction.type === "INCOME" ? "Credit" : "Debit";
  const fingerprint = createHash("sha256")
    .update([extraction.occurredAt, extraction.type === "INCOME" ? extraction.amount : -extraction.amount, extraction.description].join("|").toLowerCase())
    .digest("hex");
  const existing = await prisma.transaction.findFirst({ where: { ownerClerkId, fingerprint }, select: { id: true } });
  if (existing) {
    await recordEmailImport({
      ownerClerkId,
      provider,
      messageId: message.id,
      subject: message.subject,
      fromAddress: message.from,
      receivedAt: message.receivedAt,
      kind: "alert",
      status: "duplicate",
      detail: `${label} alert already in your ledger: ${extraction.description}`,
    });
    return false;
  }

  rows.push({
    row: {
      provider,
      messageId: message.id,
      subject: message.subject,
      from: message.from,
      receivedAt: message.receivedAt?.toISOString(),
      snippet: message.snippet?.slice(0, 400),
      amount: extraction.amount,
      currency: extraction.currency,
      occurredAt: extraction.occurredAt,
      description: extraction.description,
      type: extraction.type,
    },
    rowNumber: rows.length + 1,
    fingerprint,
    proposedData: {
      type: extraction.type,
      amount: extraction.amount,
      ...(extraction.currency ? { currency: extraction.currency } : {}),
      description: extraction.description,
      ...(extraction.merchant ? { merchant: extraction.merchant } : {}),
      occurredAt: extraction.occurredAt,
    },
  });
  await recordEmailImport({
    ownerClerkId,
    provider,
    messageId: message.id,
    subject: message.subject,
    fromAddress: message.from,
    receivedAt: message.receivedAt,
    kind: "alert",
    status: "imported",
    detail: `${label} alert: ${extraction.description}`,
  });
  return true;
}
