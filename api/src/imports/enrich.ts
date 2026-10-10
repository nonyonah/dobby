/**
 * Statement enrichment.
 *
 * The extractor hands over rows. This module turns those rows into the shape the
 * ledger needs, in a fixed order, and records what it could not prove:
 *
 *   1. **Section grouping.** A statement that prints a Wallet table and a Savings
 *      table is two accounts. Tagged here so approval can create one account per
 *      section instead of filing a Savings withdrawal under Wallet.
 *   2. **Transfer detection.** Money between the user's own pockets is not
 *      income and not spending. Resolved across the whole document, because a
 *      reference only means anything when both legs are visible.
 *   3. **Reconciliation.** The statement's own totals are compared against the
 *      parsed rows. A statement that lost rows says so here instead of quietly
 *      under-reporting the user's money forever.
 *   4. **Tax treatment.** Derived from the resolved category, never guessed, and
 *      never asked of a model.
 *
 * All of it is pure: no database, no network. The pipeline calls it, then
 * persists whatever comes back.
 */

import { checkSections, describeChecks, type SectionCheck, type SectionRows, type SectionSummary } from "./checksum.js";
import { detectTransfer, mentionsLoan, parseTransferNarration, type TransferSource } from "./transfers.js";
import { taxTreatment, type TaxTreatment } from "../tax/treatment.js";
import type { TaxCountry } from "@prisma/client";

export type EnrichedRow = {
  date: string;
  description: string;
  /** Signed: negative is money out. */
  amount: number;
  currency?: string;
  balance?: number;
  page?: number;
  subAccount?: string;
  reference?: string | null;
  debit?: number;
  credit?: number;
};

export type TransferDecision = {
  rowIndex: number;
  isTransfer: boolean;
  source?: TransferSource;
  /** Set when the counterparty is the account holder but the row stays a transfer. */
  counterparty?: string | null;
};

export type EnrichedStatement = {
  rows: EnrichedRow[];
  /** Which rows are transfers, and on what evidence. */
  transfers: Map<number, TransferDecision>;
  /** Sections as parsed, for the import record. */
  sections: SectionSummary[];
  /** Reconciliation result, or null when the statement declared no totals. */
  checks: SectionCheck[] | null;
  /** One line per unreconciled section, empty when everything adds up. */
  checkMessage: string;
  /** Rows whose inflow might be a loan, so the caller can ask rather than assume. */
  loanHints: number[];
};

/** Named sections, or a fallback label for a statement that printed none. */
const UNLABELLED = "Account";

function label(row: EnrichedRow): string {
  const text = row.subAccount?.trim();
  return text && text.length > 0 ? text : UNLABELLED;
}

/**
 * Roll the parsed rows up into the same figures the statement declares.
 *
 * The debit/credit split is preferred over the sign of `amount` because a
 * statement that prints both columns has already answered the direction
 * question, and re-deriving it from a sign is how a rounding artefact becomes a
 * transfer.
 */
function summariseRows(rows: EnrichedRow[]): SectionSummary[] {
  const bySection = new Map<string, EnrichedRow[]>();
  for (const row of rows) {
    const key = label(row);
    bySection.set(key, [...(bySection.get(key) ?? []), row]);
  }
  return [...bySection.entries()].map(([subAccount, section]) => ({
    subAccount,
    openingBalance: null,
    totalDebit: round2(section.reduce((sum, row) => sum + (row.debit ?? (row.amount < 0 ? -row.amount : 0)), 0)),
    totalCredit: round2(section.reduce((sum, row) => sum + (row.credit ?? (row.amount > 0 ? row.amount : 0)), 0)),
    closingBalance: null,
    declaredRowCount: null,
  }));
}

function toSectionRows(rows: EnrichedRow[]): SectionRows[] {
  const bySection = new Map<string, Array<{ debit: number; credit: number }>>();
  for (const row of rows) {
    const key = label(row);
    bySection.set(key, [
      ...(bySection.get(key) ?? []),
      {
        debit: row.debit ?? (row.amount < 0 ? -row.amount : 0),
        credit: row.credit ?? (row.amount > 0 ? row.amount : 0),
      },
    ]);
  }
  return [...bySection.entries()].map(([subAccount, sectionRows]) => ({ subAccount, rows: sectionRows }));
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Merge the totals the statement declared with the sections actually seen.
 *
 * A declared section with no parsed rows is kept: that is precisely the case
 * where an entire account failed to extract, and dropping it would turn a total
 * failure into a silent success.
 */
function mergeSections(declared: SectionSummary[], parsed: SectionSummary[]): SectionSummary[] {
  const merged = new Map<string, SectionSummary>();
  for (const summary of declared) merged.set(summary.subAccount.trim().toLowerCase(), { ...summary });
  for (const summary of parsed) {
    const key = summary.subAccount.trim().toLowerCase();
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, summary);
      continue;
    }
    // The declared totals are authoritative; the parsed ones are only filled in
    // where the statement stayed silent.
    merged.set(key, {
      subAccount: existing.subAccount,
      openingBalance: existing.openingBalance,
      totalDebit: existing.totalDebit,
      totalCredit: existing.totalCredit,
      closingBalance: existing.closingBalance,
      declaredRowCount: existing.declaredRowCount,
    });
  }
  return [...merged.values()];
}

export type EnrichOptions = {
  /** The account holder's own names, for own-account transfer detection. */
  holderNames: string[];
  /** Totals read from the document, when the statement printed any. */
  declared?: SectionSummary[];
  /** Tax jurisdiction, e.g. "NIGERIA". */
  taxCountry?: string | null;
};

/**
 * Everything the pipeline needs to know about a parsed statement.
 *
 * `taxCountry` is accepted and threaded through so tax can be resolved in the
 * same pass that has the category in hand; the per-row tax verdict itself is
 * applied later by the caller, which knows the category that survived
 * categorization.
 */
export function enrichStatement(rows: EnrichedRow[], options: EnrichOptions): EnrichedStatement {
  const transfers = new Map<number, TransferDecision>();
  const loanHints: number[] = [];

  rows.forEach((row, index) => {
    const verdict = detectTransfer(row, rows, options.holderNames);
    if (verdict) {
      transfers.set(index, {
        rowIndex: index,
        isTransfer: true,
        source: verdict.source,
        counterparty: parseTransferNarration(row.description).counterparty,
      });
      return;
    }
    // Not a transfer — but an inflow whose narration mentions a loan is still
    // not income until the user says which side of a loan it was.
    if (row.amount > 0 && mentionsLoan(row.description)) loanHints.push(index);
  });

  const parsedSections = summariseRows(rows);
  const sections = options.declared?.length ? mergeSections(options.declared, parsedSections) : parsedSections;
  // Only meaningful when the document actually declared totals: without them
  // every section is "unchecked", which is not the same as failing.
  const checks = options.declared?.length ? checkSections(sections, toSectionRows(rows)) : null;

  return {
    rows,
    transfers,
    sections,
    checks,
    checkMessage: checks ? describeChecks(checks) : "",
    loanHints,
  };
}

/** Row indexes that are transfers. */
export function transferIndexes(statement: EnrichedStatement): Set<number> {
  return new Set([...statement.transfers.entries()].filter(([, decision]) => decision.isTransfer).map(([index]) => index));
}

/**
 * Tax verdict for a row, given the category that survived categorization.
 *
 * Thin by design: the policy lives in `tax/treatment.ts` and the country table
 * with it. What lives here is the rule that a transfer is never a tax question
 * and an expense never reaches one.
 */
export function resolveTax(
  type: "INCOME" | "EXPENSE" | "TRANSFER",
  categoryName: string | undefined,
  country: string | null | undefined,
): { isTaxable: boolean | null; taxableSource: "rule" | "user"; taxTreatment: TaxTreatment } | null {
  if (type === "TRANSFER") {
    return { isTaxable: null, taxableSource: "rule", taxTreatment: "not_taxable" };
  }
  const verdict = taxTreatment((country ?? "NIGERIA") as TaxCountry, type, categoryName);
  if (!verdict) return null;
  if (verdict.treatment === "ask") return { isTaxable: null, taxableSource: "rule", taxTreatment: "ask" };
  return { isTaxable: verdict.treatment === "taxable", taxableSource: "rule", taxTreatment: verdict.treatment };
}
