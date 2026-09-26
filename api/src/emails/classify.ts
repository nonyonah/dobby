/**
 * Pure classification helpers for the email importer.
 *
 * An email is only imported when it looks finance related: a bank statement,
 * a receipt/invoice, or a credit/debit alert. Everything else is skipped so a
 * sync does not litter the review queue with newsletters and PDFs.
 */

import type { BankHit, MerchantHit, SenderDirectory } from "./bank-directory.js";
import { matchBankSender, matchMerchant } from "./bank-directory.js";

const STATEMENT_EXTENSIONS = ["pdf", "csv", "ofx", "qfx", "xls", "xlsx", "zip"];
const RECEIPT_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "heic"];

const STATEMENT_TERMS = /\b(statement|stmt|account summary|transaction history|mini[- ]statement|bank statement|account activity|monthly summary)\b/i;
const RECEIPT_TERMS = /\b(receipt|invoice|order confirmation|your order|purchase|payment confirmation|billing|rcpt|e[- ]?receipt)\b/i;
const ALERT_TERMS = /\b(debited|credited|debit|credit|withdrawn|withdrawal|deposited|deposit|transaction (alert|notification|declined|successful|failed)|debit alert|credit alert|payment alert|account alert|funds (received|transferred)|transfer (alert|successful|received)|upi|atm (withdrawal|usage)|available balance|insufficient funds|money (sent|received)|direct deposit)\b/i;

/** Senders that look like banks, card issuers, or payment providers. */
const FINANCIAL_SENDER =
  /\b(bank|banking|chase|citi|citibank|hsbc|barclays|santander|natwest|revolut|monzo|starling|n26|wise|transferwise|ally|wellsfargo|bankofamerica|bofa|capitalone|capital one|american ?express|discover|paypal|stripe|venmo|cash ?app|zelle|square|adyen|ramp|brex|mercury|plaid|coinbase|kraken|binance|robinhood|fidelity|vanguard|schwab|geico|gtbank|guaranty trust|zenith|access bank|first bank|firstbank|uba|united bank|sterling|kuda|opay|palmpay|paystack|flutterwave|interswitch|kojak|mtn|airtel)\b/i;

function extensionOf(filename: string): string | undefined {
  const match = /\.([a-z0-9]+)$/i.exec(filename.trim());
  return match?.[1]?.toLowerCase();
}

export type EmailKind = "statement" | "receipt" | "alert" | "none";

export function extensionKind(filename: string): "statement" | "receipt" | undefined {
  const extension = extensionOf(filename);
  if (!extension) return undefined;
  if (STATEMENT_EXTENSIONS.includes(extension)) return "statement";
  if (RECEIPT_EXTENSIONS.includes(extension)) return "receipt";
  return undefined;
}

export function isFinanceSender(address: string): boolean {
  return FINANCIAL_SENDER.test(address);
}

export type ClassifyInput = {
  subject?: string | null;
  from?: string | null;
  body?: string | null;
  filenames?: string[];
  /** Loaded sender directory — when omitted, only regex/keyword signals apply. */
  directory?: SenderDirectory;
};

export type SenderAttribution = { bank?: BankHit; merchant?: MerchantHit };

/** Bank and/or merchant attribution for a sender, from the directory. */
export function attributeSender(input: Pick<ClassifyInput, "subject" | "from" | "directory">): SenderAttribution {
  if (!input.directory) return {};
  return {
    bank: matchBankSender(input.from, input.directory),
    merchant: matchMerchant(input.from, input.subject, input.directory),
  };
}

/**
 * Decide what (if anything) an email should import.
 * Attachments win over body text; without an attachment only alert-style
 * emails from a plausible financial sender become transactions.
 *
 * Attachments need a trust signal — keywords, a directory sender hit, or a
 * finance-looking sender — so newsletter logos and promo PDFs classify
 * `none` instead of burning an AI extraction call and failing.
 */
export function classifyEmail(input: ClassifyInput): EmailKind {
  const subject = input.subject ?? "";
  const from = input.from ?? "";
  const body = input.body ?? "";
  const filenames = input.filenames ?? [];
  const text = `${subject}\n${body}`.slice(0, 4000);
  const { bank, merchant } = attributeSender(input);
  const senderIsFinancial = isFinanceSender(from) || isFinanceSender(subject) || bank !== undefined;

  if (filenames.length > 0) {
    const byExtension = filenames.map((filename) => extensionKind(filename));
    const keywordStatement = STATEMENT_TERMS.test(text) || STATEMENT_TERMS.test(filenames.join(" "));
    const keywordReceipt = RECEIPT_TERMS.test(text) || RECEIPT_TERMS.test(filenames.join(" "));
    // A PDF can be a statement or a receipt (or a tax letter) — when the
    // wording is unambiguous it decides, exactly like before.
    if (keywordStatement && !keywordReceipt) return "statement";
    if (keywordReceipt && !keywordStatement) return "receipt";
    // Ambiguous wording: statement formats from a known bank sender count
    // even when the subject is custom (e.g. Citi-style "Your document").
    if (byExtension.includes("statement") && (bank?.verified || senderIsFinancial)) return "statement";
    // Receipt formats are usually images, and newsletters carry logos — so
    // they need a known merchant/bank sender without clear wording.
    if (byExtension.includes("receipt") && !byExtension.includes("statement") && (merchant || bank?.verified)) return "receipt";
    return "none";
  }

  if (ALERT_TERMS.test(text) && (senderIsFinancial || ALERT_TERMS.test(subject))) return "alert";
  return "none";
}

/**
 * Gmail search queries for one sync pass: one selective pass per attachment
 * family (so newsletters with stray images don't crowd out statements) plus
 * a subject sweep for alerts and keyword-titled statements/receipts.
 *
 * Dates are epoch seconds — the only timezone-accurate form (slash dates are
 * midnight PST). A bare leading date is a text term, not a filter.
 */
export function gmailQueries(since: Date, until: Date = new Date()): string[] {
  const epoch = (date: Date) => Math.max(0, Math.floor(date.getTime() / 1000));
  const window = `after:${epoch(since)} before:${epoch(until)}`;
  return [
    `${window} has:attachment filename:pdf`,
    `${window} has:attachment (filename:csv OR filename:xls OR filename:xlsx OR filename:ofx OR filename:qfx)`,
    `${window} (subject:debited OR subject:credited OR subject:"transaction alert" OR subject:"debit alert" OR subject:"credit alert" OR subject:"withdrawal" OR subject:deposit OR subject:"payment alert" OR subject:"account alert" OR subject:statement OR subject:receipt OR subject:invoice)`,
  ];
}

/** Microsoft Graph message filters for one sync pass over [since, until). */
export function outlookListFilters(since: Date, until?: Date): Array<Record<string, unknown>> {
  const receivedDate = since.toISOString();
  const upper = until ? { received_date_time_le: until.toISOString() } : {};
  return [
    { has_attachments: "true", received_date_time_ge: receivedDate, ...upper, top: 50, response_detail: "detailed" },
    { search: "statement OR receipt OR debited OR credited OR withdrawal OR deposit", top: 25, response_detail: "detailed", received_date_time_ge: receivedDate, ...upper },
  ];
}
