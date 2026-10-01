import { describe, expect, it } from "vitest";
import { utils, write } from "xlsx";
import { excelToStatementRows, hashClaimAction, prepareStatementRows } from "./pipeline.js";

function bookToBuffer(grid: unknown[][], bookType: "xlsx" | "xls" = "xlsx"): Buffer {
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, utils.aoa_to_sheet(grid), "Statement");
  const out = write(workbook, { type: "buffer", bookType });
  return Buffer.from(out as ArrayBuffer);
}

describe("excelToStatementRows — GTB debit/credit layout", () => {
  const grid = [
    ["Guaranty Trust Bank — Account Statement", "", "", "", ""],
    ["Account: 0123456789  Period: Sep 2026", "", "", "", ""],
    ["Transaction Date", "Narration", "Debit", "Credit", "Balance"],
    ["2026-09-01", "Transfer to Ada", 5000, null, 10000],
    ["2026-09-02", "Salary payment", null, 200000, 205000],
    ["", "", "", "", ""],
  ];
  it("skips title rows and maps debit/credit columns (xlsx)", () => {
    const { rows } = excelToStatementRows(bookToBuffer(grid));
    expect(rows).toHaveLength(2);
    const prepared = prepareStatementRows(rows);
    expect(prepared[0]!.proposedData).toMatchObject({ type: "EXPENSE", amount: 5000, description: "Transfer to Ada" });
    expect(prepared[1]!.proposedData).toMatchObject({ type: "INCOME", amount: 200000, description: "Salary payment" });
  });
  it("reads legacy .xls workbooks too", () => {
    const { rows } = excelToStatementRows(bookToBuffer(grid, "xls"));
    expect(rows).toHaveLength(2);
  });
});

describe("excelToStatementRows — single amount + DR/CR indicator", () => {
  it("folds DR into a negative amount", () => {
    const { rows } = excelToStatementRows(bookToBuffer([
      ["Date", "Description", "Amount", "DR/CR"],
      ["2026-09-01", "POS purchase", 2500, "DR"],
      ["2026-09-02", "Refund", 1000, "CR"],
    ]));
    const prepared = prepareStatementRows(rows);
    expect(prepared[0]!.proposedData).toMatchObject({ type: "EXPENSE", amount: 2500 });
    expect(prepared[1]!.proposedData).toMatchObject({ type: "INCOME", amount: 1000 });
  });
});

describe("excelToStatementRows — failures", () => {
  it("throws when no header row exists", () => {
    expect(() => excelToStatementRows(bookToBuffer([["hello", "world"], ["foo", "bar"]]))).toThrow(/header row/);
  });
});

describe("hashClaimAction — deciding what to do about repeated bytes", () => {
  const settled = { id: "import-1", originalName: "July_Statement.pdf", rowCount: 48, status: "COMPLETED" };

  it("proceeds when nobody holds the hash", () => {
    expect(hashClaimAction({ selfId: "import-2", holder: null }).kind).toBe("proceed");
  });

  it("proceeds when the row holding the hash is this row", () => {
    expect(hashClaimAction({ selfId: "import-1", holder: settled }).kind).toBe("proceed");
  });

  it("skips extraction when a settled import already read these bytes", () => {
    const action = hashClaimAction({ selfId: "import-2", holder: settled });
    expect(action.kind).toBe("skip");
    if (action.kind !== "skip") throw new Error("expected skip");
    // The row count carries over so the repeat shows the same result as the
    // original instead of an empty import.
    expect(action.original.rowCount).toBe(48);
    expect(action.original.id).toBe("import-1");
  });

  it("treats an in-review import as already read too", () => {
    expect(hashClaimAction({ selfId: "import-2", holder: { ...settled, status: "REVIEW" } }).kind).toBe("skip");
  });

  it("asks the user to retry when the other import is still extracting", () => {
    // Marking this COMPLETED would claim a result nobody has yet, so the race
    // has to surface as an actionable failure instead.
    const action = hashClaimAction({ selfId: "import-2", holder: { ...settled, status: "PROCESSING" } });
    expect(action.kind).toBe("retry-later");
    if (action.kind !== "retry-later") throw new Error("expected retry-later");
    expect(action.message).toContain("July_Statement.pdf");
    expect(action.message).toContain("Try again");
  });

  it("ignores a failed import, which stays retryable", () => {
    // FAILED rows are excluded from the unique index precisely so a locked PDF
    // or a provider error can be imported again.
    expect(hashClaimAction({ selfId: "import-2", holder: { ...settled, status: "FAILED" } }).kind).toBe("proceed");
  });
});
