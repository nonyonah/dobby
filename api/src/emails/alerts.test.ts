import { describe, expect, it } from "vitest";
import { preparsedAlert } from "./alerts.js";

describe("preparsedAlert — GTBank grammar", () => {
  it("parses a debit alert", () => {
    expect(preparsedAlert({
      body: "Acct: ******2342 Amt: NGN1,440.00 DR Desc: POS/WITHDRAWAL Avail Bal: NGN754.04",
    })).toEqual({ type: "EXPENSE", amount: 1440, currency: "NGN", description: "POS/WITHDRAWAL" });
  });
  it("parses a credit alert without a currency code", () => {
    expect(preparsedAlert({
      body: "Acct: 0228895607 Amt: 265,000.00 CR Desc: Transfer from Ada Avail Bal: 425,102.41",
    })).toEqual({ type: "INCOME", amount: 265000, description: "Transfer from Ada" });
  });
});

describe("preparsedAlert — generic grammar", () => {
  it("parses amount + direction + narration", () => {
    expect(preparsedAlert({
      subject: "Credit Alert",
      body: "Hello, Amount: $25.00 has been credited. Narration: Refund from store. Balance: $100.00",
    })).toEqual({ type: "INCOME", amount: 25, currency: "USD", description: "Refund from store." });
  });
  it("returns undefined when direction is ambiguous", () => {
    expect(preparsedAlert({ body: "Amount: NGN500.00. Thank you for banking with us." })).toBeUndefined();
  });
  it("returns undefined without a description", () => {
    expect(preparsedAlert({ body: "Amt: NGN500.00 DR. No other details." })).toBeUndefined();
  });
  it("returns undefined for non-alerts", () => {
    expect(preparsedAlert({ subject: "This week's startups", body: "Hello founder!" })).toBeUndefined();
  });
});
