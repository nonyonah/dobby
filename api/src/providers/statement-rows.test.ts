import { describe, expect, it } from "vitest";
import { parseAiStatementRows } from "./gemini.js";

const row = (over: Record<string, unknown> = {}) => ({
  date: "2026-01-05",
  description: "SQ *COFFEE 4471",
  amount: -4.5,
  ...over,
});

describe("statement row parsing with a source text layer", () => {
  const source = "01/05/2026  SQ *COFFEE 4471  -4.50  1,204.11";

  it("returns the descriptor exactly as the source spells it", () => {
    const { rows } = parseAiStatementRows(JSON.stringify([row({ description: "sq *coffee 4471" })]), 3, source);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.description).toBe("SQ *COFFEE 4471");
  });

  it("rejects a descriptor the model invented from a recognisable brand", () => {
    const { rows, rejectedRows } = parseAiStatementRows(JSON.stringify([row({ description: "Starbucks" })]), 3, source);
    expect(rows).toHaveLength(0);
    expect(rejectedRows).toBe(1);
  });

  it("stamps the page number and keeps a printed currency", () => {
    const { rows } = parseAiStatementRows(JSON.stringify([row({ currency: "gbp" })]), 7, source);
    expect(rows[0]?.page).toBe(7);
    expect(rows[0]?.currency).toBe("GBP");
  });

  it("drops a currency that is not an ISO-4217 code", () => {
    const { rows } = parseAiStatementRows(JSON.stringify([row({ currency: "dollars" })]), 1, source);
    expect(rows[0]?.currency).toBeUndefined();
  });
});

describe("statement row parsing on a vision page with no source text", () => {
  it("keeps the model's descriptor, which cannot be checked against anything", () => {
    const { rows, rejectedRows } = parseAiStatementRows(JSON.stringify([row({ description: "SQ *COFFEE 4471" })]), 2, "");
    expect(rows).toHaveLength(1);
    expect(rejectedRows).toBe(0);
    expect(rows[0]?.description).toBe("SQ *COFFEE 4471");
  });

  it("still enforces date and amount validity", () => {
    const { rows, rejectedRows } = parseAiStatementRows(
      JSON.stringify([row({ date: "sometime in january" }), row({ amount: 0 }), row({ amount: -4.5 })]),
      2,
      "",
    );
    expect(rows).toHaveLength(1);
    expect(rejectedRows).toBe(2);
    expect(rows[0]?.amount).toBe(-4.5);
  });

  it("still rejects an empty or missing descriptor", () => {
    const { rows, rejectedRows } = parseAiStatementRows(JSON.stringify([row({ description: "   " }), row({ description: 42 })]), 2, "");
    expect(rows).toHaveLength(0);
    expect(rejectedRows).toBe(2);
  });

  it("rejects a non-finite balance rather than importing NaN", () => {
    const { rows, rejectedRows } = parseAiStatementRows(JSON.stringify([row({ balance: "n/a" })]), 2, "");
    expect(rows).toHaveLength(0);
    expect(rejectedRows).toBe(1);
  });
});

describe("statement row payload shapes", () => {
  const source = "01/05/2026  SQ *COFFEE 4471  -4.50  1,204.11";

  it("accepts a bare array", () => {
    expect(parseAiStatementRows(JSON.stringify([row()]), 1, source).rows).toHaveLength(1);
  });

  it("accepts a transactions wrapper", () => {
    expect(parseAiStatementRows(JSON.stringify({ transactions: [row()] }), 1, source).rows).toHaveLength(1);
  });

  it("throws when the payload holds no transaction array", () => {
    expect(() => parseAiStatementRows(JSON.stringify({ total: 12 }), 1, source)).toThrow(/transaction array/);
  });
});