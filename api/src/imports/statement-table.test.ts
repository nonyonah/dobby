import { describe, expect, it } from "vitest";
import { parseDeclaredSummaries, parseStatementTable } from "./statement-table.js";

/**
 * A two-account statement in the shape OPay prints: a heading, then a table of
 * transactions, then that account's own totals. The figures are the real ones
 * from the tested extract (Wallet 14 rows, Savings 3 rows).
 */
const WALLET_SECTION = `
Wallet
| Date | Description | Reference | Debit | Credit | Balance |
| --- | --- | --- | --- | --- | --- |
| 27/06/2026 | Transfer from Onah, EMMANUEL CHINONSO \\| Kuda MFB \\| 200****751 \\| data | 090267260627072248397009750751 | | 800.00 | 1,204.60 |
| 27/06/2026 | Mobile Data \\| 8153324197 \\| Glo \\| 3GB 3 Days Plan | 260627110100885471636961 | 804.60 | | 404.00 |
| 27/06/2026 | OWealth Withdrawal(Transaction Payment) | 260627010201885371514548 | | 4.60 | 408.60 |
| 27/06/2026 | Auto-save to OWealth Balance | 260627140300910433245426 | 510.00 | | -101.40 |
| 27/06/2026 | Transfer from ABUMISI ADAEZE BARBARA \\| Guaranty Trust Bank \\| 031****357 \\| | 000013260717142150000071984541 | | 5000.00 | 4898.60 |
| Borrow/loan to CHINONSO EMMANUEL Onah. | | | | |
Total Debit: 4,324.60
Total Credit: 18,333.60
Closing Balance: 4,898.60
`;

const SAVINGS_SECTION = `
Savings
| Date | Description | Reference | Debit | Credit | Balance |
| --- | --- | --- | --- | --- | --- |
| 27/06/2026 | OWealth Interest Earned | 26062799K7zOQej2XStPpf7mZczP0 | | 0.09 | 510.09 |
| 27/06/2026 | OWealth Withdrawal (Transaction Payment) | 260627010201885371514548 | 4.60 | | 505.49 |
| 27/06/2026 | Auto-save to OWealth Balance | 260627140300910433245426 | | 510.00 | 1015.49 |
Total Debit: 4.60
Total Credit: 510.09
`;

describe("multi-section statement tables", () => {
  const rows = parseStatementTable(WALLET_SECTION + SAVINGS_SECTION, 1);

  it("tags every row with the account section it was printed under", () => {
    expect(rows.filter((row) => row.subAccount === "Wallet")).toHaveLength(5);
    expect(rows.filter((row) => row.subAccount === "Savings")).toHaveLength(3);
    expect(rows.every((row) => row.subAccount === "Wallet" || row.subAccount === "Savings")).toBe(true);
  });

  it("keeps the bank reference as a string, leading zeros intact", () => {
    const loan = rows.find((row) => row.reference?.startsWith("000013"));
    expect(loan?.reference).toBe("000013260717142150000071984541");
    expect(loan?.description).toContain("Borrow/loan");
  });

  it("joins a description that wrapped onto the next line", () => {
    // The narration is split across two physical lines in the PDF. Dropping the
    // tail would lose both the counterparty and the fact that it was a loan.
    const loan = rows.find((row) => row.subAccount === "Wallet" && row.amount === 5000);
    expect(loan?.description).toBe(
      "Transfer from ABUMISI ADAEZE BARBARA | Guaranty Trust Bank | 031****357 | Borrow/loan to CHINONSO EMMANUEL Onah.",
    );
  });

  it("carries both legs of a movement on the same reference across two sections", () => {
    const withdrawal = rows.find((row) => row.reference === "260627010201885371514548" && row.subAccount === "Wallet");
    const savingsLeg = rows.find((row) => row.reference === "260627010201885371514548" && row.subAccount === "Savings");
    expect(withdrawal?.credit).toBe(4.6);
    expect(savingsLeg?.debit).toBe(4.6);
  });

  it("exposes debit and credit magnitudes alongside the signed amount", () => {
    const autosave = rows.find((row) => row.reference === "260627140300910433245426" && row.subAccount === "Wallet");
    expect(autosave?.amount).toBe(-510);
    expect(autosave?.debit).toBe(510);
    expect(autosave?.credit).toBeUndefined();
  });

  it("does not mistake a single-account statement for a two-account one", () => {
    const single = parseStatementTable(WALLET_SECTION, 1);
    expect(single.every((row) => row.subAccount === "Wallet")).toBe(true);
  });
});

describe("declared statement totals", () => {
  it("reads each account's own totals", () => {
    const summaries = parseDeclaredSummaries(WALLET_SECTION + SAVINGS_SECTION);
    expect(summaries).toHaveLength(2);

    const wallet = summaries.find((summary) => summary.subAccount === "Wallet")!;
    expect(wallet.totalDebit).toBe(4324.6);
    expect(wallet.totalCredit).toBe(18333.6);
    expect(wallet.closingBalance).toBe(4898.6);

    const savings = summaries.find((summary) => summary.subAccount === "Savings")!;
    expect(savings.totalDebit).toBe(4.6);
    expect(savings.totalCredit).toBe(510.09);
  });

  it("reads a transaction count when the statement declares one", () => {
    const summaries = parseDeclaredSummaries("Savings\nTotal Debit: 4.60\nNo. of transactions: 3\n");
    expect(summaries[0]?.declaredRowCount).toBe(3);
  });

  it("keeps a single-account statement as one section", () => {
    const summaries = parseDeclaredSummaries("Total Credit: 1,234.56\nTotal Debit: 78.90\n");
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.totalCredit).toBe(1234.56);
    expect(summaries[0]?.totalDebit).toBe(78.9);
  });
});
