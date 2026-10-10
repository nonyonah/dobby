import { describe, expect, it } from "vitest";
import { signedFor } from "./net-worth.js";
import { enrichStatement, resolveTax, transferIndexes, type EnrichedRow } from "../imports/enrich.js";

const HOLDER = ["CHINONSO EMMANUEL Onah"];

/** The rows exactly as the OPay extract supplied them, in two sections. */
const OPay_ROWS: EnrichedRow[] = [
  { date: "2026-06-27T00:00:00.000Z", description: "Transfer from Onah, EMMANUEL CHINONSO | Kuda MFB | 200****751 | data", amount: 800, subAccount: "Wallet", reference: "090267260627072248397009750751", credit: 800 },
  { date: "2026-06-27T00:00:00.000Z", description: "Mobile Data | 8153324197 | Glo | 3GB 3 Days Plan", amount: -804.6, subAccount: "Wallet", reference: "260627110100885471636961", debit: 804.6 },
  { date: "2026-06-27T00:00:00.000Z", description: "OWealth Withdrawal(Transaction Payment)", amount: 4.6, subAccount: "Wallet", reference: "260627010201885371514548", credit: 4.6 },
  { date: "2026-06-27T00:00:00.000Z", description: "Auto-save to OWealth Balance", amount: -510, subAccount: "Wallet", reference: "260627140300910433245426", debit: 510 },
  { date: "2026-06-27T00:00:00.000Z", description: "OWealth Interest Earned", amount: 0.09, subAccount: "Savings", reference: "26062799K7zOQej2XStPpf7mZczP0", credit: 0.09 },
  { date: "2026-06-27T00:00:00.000Z", description: "OWealth Withdrawal (Transaction Payment)", amount: -4.6, subAccount: "Savings", reference: "260627010201885371514548", debit: 4.6 },
  { date: "2026-06-27T00:00:00.000Z", description: "Auto-save to OWealth Balance", amount: 510, subAccount: "Savings", reference: "260627140300910433245426", credit: 510 },
  { date: "2026-07-04T00:00:00.000Z", description: "Transfer from CHINONSO ONAH | GoMoney | 850****872 | Transfer to CHINONSO EMMANUEL ONAH", amount: 1690, subAccount: "Wallet", reference: "100022260704065354082522056797", credit: 1690 },
  { date: "2026-07-17T00:00:00.000Z", description: "Transfer from ABUMISI ADAEZE BARBARA | Guaranty Trust Bank | 031****357 | Borrow/loan to CHINONSO EMMANUEL Onah.", amount: 5000, subAccount: "Wallet", reference: "000013260717142150000071984541", credit: 5000 },
];

describe("statement enrichment", () => {
  const statement = enrichStatement(OPay_ROWS, { holderNames: HOLDER });
  const transfers = transferIndexes(statement);

  it("groups rows into the sections the statement printed", () => {
    expect(statement.sections.map((section) => section.subAccount).sort()).toEqual(["Savings", "Wallet"]);
    const wallet = statement.sections.find((section) => section.subAccount === "Wallet")!;
    expect(wallet.totalDebit).toBe(1314.6);
    expect(wallet.totalCredit).toBe(7494.6);
  });

  it("marks both legs of an OWealth movement, in both sections", () => {
    // Wallet credit 4.60 <-> Savings debit 4.60, and Wallet debit 510 <-> Savings credit 510.
    expect(transfers.has(2)).toBe(true);
    expect(transfers.has(3)).toBe(true);
    expect(transfers.has(5)).toBe(true);
    expect(transfers.has(6)).toBe(true);
  });

  it("keeps interest out of the transfer verdict", () => {
    expect(transfers.has(4)).toBe(false);
  });

  it("treats money arriving from the user's own name as a transfer", () => {
    expect(transfers.has(0)).toBe(true);
    expect(transfers.has(7)).toBe(true);
  });

  it("does not treat a genuine inbound payment from someone else as a transfer", () => {
    expect(transfers.has(8)).toBe(false);
  });

  it("flags the loan-shaped inflow as a question rather than income", () => {
    expect(statement.loanHints).toEqual([8]);
  });
});

describe("checksum against the statement's own totals", () => {
  it("reconciles the tested extract", () => {
    const statement = enrichStatement(OPay_ROWS, {
      holderNames: HOLDER,
      declared: [
        // The subset pasted by the user, not the full statement: the Wallet
        // section declares the whole statement's totals, so the parsed subset
        // is short by exactly the rows that were not pasted.
        { subAccount: "Wallet", openingBalance: null, totalDebit: 4324.6, totalCredit: 18333.6, closingBalance: null, declaredRowCount: null },
        { subAccount: "Savings", openingBalance: null, totalDebit: 4.6, totalCredit: 510.09, closingBalance: null, declaredRowCount: 3 },
      ],
    });
    const savings = statement.checks?.find((check) => check.subAccount === "Savings");
    expect(savings?.reconciled).toBe(true);

    const wallet = statement.checks?.find((check) => check.subAccount === "Wallet");
    expect(wallet?.reconciled).toBe(false);
    expect(statement.checkMessage).toMatch(/Wallet/);
  });

  it("reports nothing when the statement declared no totals", () => {
    const statement = enrichStatement(OPay_ROWS, { holderNames: HOLDER });
    expect(statement.checks).toBeNull();
    expect(statement.checkMessage).toBe("");
  });
});

describe("tax treatment", () => {
  it("never asks about a transfer or an expense", () => {
    expect(resolveTax("TRANSFER", undefined, "NIGERIA")).toEqual({ isTaxable: null, taxableSource: "rule", taxTreatment: "not_taxable" });
    expect(resolveTax("EXPENSE", "Food & groceries", "NIGERIA")).toBeNull();
  });

  it("taxes income by statute", () => {
    expect(resolveTax("INCOME", "Interest income", "NIGERIA")).toEqual({ isTaxable: true, taxableSource: "rule", taxTreatment: "taxable" });
  });

  it("asks rather than guessing on an uncategorised inflow", () => {
    expect(resolveTax("INCOME", undefined, "NIGERIA")).toEqual({ isTaxable: null, taxableSource: "rule", taxTreatment: "ask" });
  });

  it("treats a loan receipt as not taxable", () => {
    expect(resolveTax("INCOME", "Loan received", "NIGERIA")).toEqual({ isTaxable: false, taxableSource: "rule", taxTreatment: "not_taxable" });
  });
});

describe("net worth sign convention", () => {
  it("signs income up and expenses down", () => {
    expect(signedFor("INCOME", null, 100)).toBe(100);
    expect(signedFor("EXPENSE", null, 100)).toBe(-100);
  });

  it("signs a transfer by its direction, not by its type", () => {
    // Both legs of a movement are TRANSFER. Reading the type alone subtracted
    // both and shrank net worth by the whole movement.
    expect(signedFor("TRANSFER", "IN", 510)).toBe(510);
    expect(signedFor("TRANSFER", "OUT", 510)).toBe(-510);
    expect(signedFor("TRANSFER", "IN", 510) + signedFor("TRANSFER", "OUT", 510)).toBe(0);
  });

  it("treats a direction-less transfer as an outflow", () => {
    expect(signedFor("TRANSFER", null, 510)).toBe(-510);
  });
});
