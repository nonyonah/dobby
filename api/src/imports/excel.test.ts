import { describe, expect, it } from "vitest";
import { utils, write } from "xlsx";
import { excelToStatementRows, prepareStatementRows } from "./pipeline.js";

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
