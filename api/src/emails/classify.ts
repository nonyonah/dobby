/**
 * Pure classification helpers for the email importer.
 *
 * An email is only imported when it looks finance related: a bank statement,
 * a receipt/invoice, or a credit/debit alert. Everything else is skipped so a
 * sync does not litter the review queue with newsletters and PDFs.
 */

export type EmailKind = "statement" | "receipt" | "alert" | "none";

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
};

/**
 * Decide what (if anything) an email should import.
 * Attachments win over body text; without an attachment only alert-style
 * emails from a plausible financial sender become transactions.
 */
export function classifyEmail(input: ClassifyInput): EmailKind {
  const subject = input.subject ?? "";
  const from = input.from ?? "";
  const body = input.body ?? "";
  const filenames = input.filenames ?? [];
  const text = `${subject}\n${body}`.slice(0, 4000);
  const senderIsFinancial = isFinanceSender(from) || isFinanceSender(subject);

  if (filenames.length > 0) {
    const byExtension = filenames.map((filename) => extensionKind(filename));
    // A PDF can be a statement or a receipt (or a tax letter) — the wording decides.
    if (STATEMENT_TERMS.test(text) || STATEMENT_TERMS.test(filenames.join(" "))) return "statement";
    if (RECEIPT_TERMS.test(text) || RECEIPT_TERMS.test(filenames.join(" "))) return "receipt";
    if (byExtension.includes("receipt") && !byExtension.includes("statement")) return "receipt";
    if (byExtension.includes("statement") && senderIsFinancial) return "statement";
    if (byExtension.includes("statement")) return "statement";
    return "none";
  }

  if (ALERT_TERMS.test(text) && (senderIsFinancial || ALERT_TERMS.test(subject))) return "alert";
  return "none";
}

/**
 * Gmail search queries for one sync pass. Kept deliberately broad —
 * `classifyEmail` is the filter that keeps non-finance mail out.
 */
export function gmailQueries(since: Date): string[] {
  const after = `${since.getFullYear()}/${String(since.getMonth() + 1).padStart(2, "0")}/${String(since.getDate()).padStart(2, "0")}`;
  return [
    `${after} has:attachment`,
    `${after} (subject:debited OR subject:credited OR subject:"transaction alert" OR subject:"debit alert" OR subject:"credit alert" OR subject:"withdrawal" OR subject:deposit OR subject:"payment alert" OR subject:"account alert" OR subject:statement OR subject:receipt)`,
  ];
}

/** Microsoft Graph message filters for one sync pass. */
export function outlookListFilters(since: Date): Array<Record<string, unknown>> {
  const receivedDate = since.toISOString();
  return [
    { has_attachments: "true", received_date_time_ge: receivedDate, top: 50, response_detail: "detailed" },
    { search: "statement OR receipt OR debited OR credited OR withdrawal OR deposit", top: 25, response_detail: "detailed", received_date_time_ge: receivedDate },
  ];
}
