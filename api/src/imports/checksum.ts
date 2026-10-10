/**
 * Statement checksum.
 *
 * Every statement declares its own arithmetic: an opening balance, a total
 * debit, a total credit, a closing balance and a row count. Parsing without
 * checking against them means a statement that yielded 12 of 40 transactions
 * imports "successfully" and quietly under-reports the user's money for the rest
 * of their life.
 *
 * So the declared figures are extracted, the parsed rows are totalled the same
 * way, and the two are compared. A section that reconciles imports. A section
 * that does not is marked for review, with the difference stated in money and
 * rows — a reviewer needs to know *how much* is unaccounted for, not just that
 * something is wrong.
 *
 * The check is deliberately per-section. A document carrying a Wallet and a
 * Savings section has one set of totals for each, and netting them together
 * would let a large error in one mask a matching error in the other.
 */

export interface SectionSummary {
  /** The label the document used, e.g. "Wallet". */
  subAccount: string;
  openingBalance: number | null;
  totalDebit: number | null;
  totalCredit: number | null;
  closingBalance: number | null;
  declaredRowCount: number | null;
}

export interface SectionRows {
  subAccount: string;
  rows: Array<{ debit: number; credit: number }>;
}

export interface CheckFinding {
  subAccount: string;
  field: string;
  declared: number | null;
  actual: number | null;
  /** `actual - declared`, null when either side is unknown. */
  difference: number | null;
  rows: string;
}

export interface SectionCheck {
  subAccount: string;
  reconciled: boolean;
  parsedRowCount: number;
  declaredRowCount: number | null;
  parsedDebit: number;
  parsedCredit: number;
  parsedNet: number;
  /** One line per mismatch, ready to show a reviewer. */
  findings: CheckFinding[];
}

/** Money comparison tolerance, in the document's own currency. */
const MONEY_EPSILON = 0.005;

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function compareMoney(field: string, subAccount: string, declared: number | null, actual: number): CheckFinding[] {
  if (declared === null) return [];
  const difference = round2(actual - declared);
  if (Math.abs(difference) <= MONEY_EPSILON) return [];
  return [{
    subAccount,
    field,
    declared: round2(declared),
    actual: round2(actual),
    difference,
    rows: `${subAccount}: ${field} is off by ${difference.toFixed(2)}`,
  }];
}

/**
 * Reconciles every section of a document.
 *
 * Rows are grouped by their own section label, so a document that lost its
 * section split entirely is reported as missing rows rather than as a single
 * unexplained total.
 */
export function checkSections(summaries: SectionSummary[], sections: SectionRows[]): SectionCheck[] {
  const byLabel = new Map(summaries.map((summary) => [normaliseLabel(summary.subAccount), summary]));

  const checks: SectionCheck[] = [];

  for (const summary of summaries) {
    const parsed = sections.find((section) => normaliseLabel(section.subAccount) === normaliseLabel(summary.subAccount));
    const rows = parsed?.rows ?? [];

    const parsedDebit = round2(rows.reduce((sum, row) => sum + (row.debit || 0), 0));
    const parsedCredit = round2(rows.reduce((sum, row) => sum + (row.credit || 0), 0));
    const parsedNet = round2(parsedCredit - parsedDebit);

    const findings: CheckFinding[] = [];

    // Row count is the cheapest and most sensitive signal: a wrapped description
    // dropped by the parser shows up here first.
    const declaredRowCount = summary.declaredRowCount;
    if (declaredRowCount !== null && declaredRowCount !== rows.length) {
      const difference = rows.length - declaredRowCount;
      findings.push({
        subAccount: summary.subAccount,
        field: "rowCount",
        declared: declaredRowCount,
        actual: rows.length,
        difference,
        rows: `${summary.subAccount}: parsed ${rows.length} rows but the statement declares ${declaredRowCount} (${difference > 0 ? difference : Math.abs(difference)} ${difference > 0 ? "extra" : "missing"})`,
      });
    }

    findings.push(...compareMoney("totalDebit", summary.subAccount, summary.totalDebit, parsedDebit));
    findings.push(...compareMoney("totalCredit", summary.subAccount, summary.totalCredit, parsedCredit));

    // The strongest signal, when the statement gives one: opening + credit −
    // debit must equal closing.
    if (summary.openingBalance !== null && summary.closingBalance !== null) {
      const implied = round2(summary.openingBalance + parsedCredit - parsedDebit);
      const difference = round2(implied - summary.closingBalance);
      if (Math.abs(difference) > MONEY_EPSILON) {
        findings.push({
          subAccount: summary.subAccount,
          field: "closingBalance",
          declared: round2(summary.closingBalance),
          actual: implied,
          difference,
          rows: `${summary.subAccount}: opening + credit − debit gives ${implied.toFixed(2)} but the statement closes at ${summary.closingBalance.toFixed(2)}`,
        });
      }
    }

    checks.push({
      subAccount: summary.subAccount,
      // A section with nothing to compare against is not "verified" — it is
      // unchecked, which is a different thing and must not read as a pass.
      reconciled: findings.length === 0 && summary.totalDebit !== null && summary.totalCredit !== null,
      parsedRowCount: rows.length,
      declaredRowCount,
      parsedDebit,
      parsedCredit,
      parsedNet,
      findings,
    });
  }

  // Sections present in the rows but absent from the declared summary are
  // themselves a finding: the document told us about fewer accounts than it
  // carries.
  for (const section of sections) {
    if (byLabel.has(normaliseLabel(section.subAccount))) continue;
    checks.push({
      subAccount: section.subAccount,
      reconciled: false,
      parsedRowCount: section.rows.length,
      declaredRowCount: null,
      parsedDebit: round2(section.rows.reduce((sum, row) => sum + (row.debit || 0), 0)),
      parsedCredit: round2(section.rows.reduce((sum, row) => sum + (row.credit || 0), 0)),
      parsedNet: 0,
      findings: [{
        subAccount: section.subAccount,
        field: "section",
        declared: null,
        actual: section.rows.length,
        difference: null,
        rows: `${section.subAccount}: rows were parsed for this account but the statement declared no totals for it`,
      }],
    });
  }

  return checks;
}

const normaliseLabel = (label: string) => label.trim().toLowerCase();

/** One line per document, for the import error message. */
export function describeChecks(checks: SectionCheck[]): string {
  const failed = checks.filter((check) => !check.reconciled);
  if (failed.length === 0) return "";
  return failed
    .map((check) => (check.findings.length > 0 ? check.findings.map((finding) => finding.rows).join("; ") : `${check.subAccount}: could not be checked against the statement totals`))
    .join(" | ");
}