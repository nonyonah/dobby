import { describe, expect, it } from "vitest";
import { checkSections, describeChecks } from "./checksum.js";

const walletSummary = {
  subAccount: "Wallet",
  openingBalance: 0,
  totalDebit: 4324.6,
  totalCredit: 18333.6,
  closingBalance: 14009.0,
  declaredRowCount: 14,
};

const walletRows = {
  subAccount: "Wallet",
  rows: [
    { debit: 0, credit: 800 }, { debit: 804.6, credit: 0 }, { debit: 0, credit: 4.6 },
    { debit: 510, credit: 0 }, { debit: 500, credit: 0 }, { debit: 0, credit: 1421 },
    { debit: 2100, credit: 0 }, { debit: 400, credit: 0 }, { debit: 0, credit: 1690 },
    { debit: 10, credit: 0 }, { debit: 0, credit: 1418 }, { debit: 0, credit: 5000 },
    { debit: 0, credit: 5000 }, { debit: 0, credit: 3000 },
  ],
};

describe("statement checksum", () => {
  it("passes when the parsed rows reproduce the declared totals", () => {
    const [check] = checkSections([walletSummary], [walletRows]);
    expect(check!.reconciled).toBe(true);
    expect(check!.findings).toHaveLength(0);
    expect(check!.parsedDebit).toBeCloseTo(4324.6, 2);
    expect(check!.parsedCredit).toBeCloseTo(18333.6, 2);
  });

  it("catches a dropped row by count and by money", () => {
    const rows = { subAccount: "Wallet", rows: walletRows.rows.slice(0, 13) };
    const [check] = checkSections([walletSummary], [rows]);
    expect(check!.reconciled).toBe(false);
    const fields = check!.findings.map((finding) => finding.field);
    expect(fields).toContain("rowCount");
    expect(fields).toContain("totalCredit");
    expect(check!.findings.find((finding) => finding.field === "totalCredit")!.difference).toBeCloseTo(-3000, 2);
  });

  it("checks each section separately, so an error in one cannot mask the other", () => {
    const savingsSummary = {
      subAccount: "Savings",
      openingBalance: 90.83,
      totalDebit: 4.6,
      totalCredit: 510.09,
      closingBalance: 596.32,
      declaredRowCount: 3,
    };
    const savingsRows = {
      subAccount: "Savings",
      rows: [{ debit: 0, credit: 0.09 }, { debit: 4.6, credit: 0 }, { debit: 0, credit: 510 }],
    };
    const checks = checkSections([walletSummary, savingsSummary], [walletRows, savingsRows]);
    expect(checks.every((check) => check.reconciled)).toBe(true);

    // Break only Savings.
    const broken = checkSections(
      [walletSummary, savingsSummary],
      [walletRows, { subAccount: "Savings", rows: savingsRows.rows.slice(0, 1) }],
    );
    expect(broken.find((check) => check.subAccount === "Wallet")!.reconciled).toBe(true);
    expect(broken.find((check) => check.subAccount === "Savings")!.reconciled).toBe(false);
  });

  it("reconciles the running balance against the declared closing balance", () => {
    const [check] = checkSections([walletSummary], [{ subAccount: "Wallet", rows: walletRows.rows.slice(0, 1) }]);
    expect(check!.findings.some((finding) => finding.field === "closingBalance")).toBe(true);
  });

  it("flags a section that has rows but no declared totals", () => {
    const [check] = checkSections(
      [{ ...walletSummary, subAccount: "Investments" }],
      [{ subAccount: "Investments", rows: [{ debit: 1, credit: 0 }] }],
    );
    expect(check!.reconciled).toBe(false);
  });

  it("does not call an unchecked section reconciled", () => {
    // No totals declared at all is "we could not verify", which must never be
    // reported as a pass.
    const [check] = checkSections(
      [{ subAccount: "Wallet", openingBalance: null, totalDebit: null, totalCredit: null, closingBalance: null, declaredRowCount: null }],
      [walletRows],
    );
    expect(check!.reconciled).toBe(false);
  });

  it("summarises failures in one readable line", () => {
    const checks = checkSections([walletSummary], [{ subAccount: "Wallet", rows: walletRows.rows.slice(0, 1) }]);
    const message = describeChecks(checks);
    expect(message).toContain("Wallet");
    expect(message).toMatch(/rowCount|parsed .* rows/);
  });
});