import { TransactionType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { taxTreatment, UNCATEGORIZED_CATEGORY, OWN_ACCOUNT_TRANSFER_CATEGORY } from "./treatment.js";

const tx = (type: TransactionType, category?: string | null) => taxTreatment("NIGERIA", type, category);

describe("taxTreatment — Nigeria", () => {
  it("taxes the statutory income categories", () => {
    for (const category of ["Work payment", "Salary", "Business sales", "Interest income"]) {
      expect(tx(TransactionType.INCOME, category)?.treatment).toBe("taxable");
    }
  });

  it("does not tax gifts, loans, refunds or own-account movements", () => {
    for (const category of ["Gift / family support", "Loan received", "Refund", OWN_ACCOUNT_TRANSFER_CATEGORY]) {
      expect(tx(TransactionType.INCOME, category)?.treatment).toBe("not_taxable");
    }
  });

  it("asks on Other income and on Uncategorized", () => {
    expect(tx(TransactionType.INCOME, "Other income")?.treatment).toBe("ask");
    expect(tx(TransactionType.INCOME, UNCATEGORIZED_CATEGORY)?.treatment).toBe("ask");
    expect(tx(TransactionType.INCOME, null)?.treatment).toBe("ask");
  });

  it("asks when an expense category appears on an inflow, rather than silently taxing it", () => {
    const result = tx(TransactionType.INCOME, "Food & Groceries");
    expect(result?.treatment).toBe("ask");
    expect(result?.reason).toMatch(/spending category/i);
  });

  it("matches case-insensitively", () => {
    expect(tx(TransactionType.INCOME, "salary")?.treatment).toBe("taxable");
  });

  it("returns null for expense and transfer rows, so the column stays null", () => {
    // Not "not_taxable": an expense is not a statement about deductibility, and
    // storing false would assert something we have not established.
    expect(tx(TransactionType.EXPENSE, "Transport")).toBeNull();
    expect(tx(TransactionType.TRANSFER, OWN_ACCOUNT_TRANSFER_CATEGORY)).toBeNull();
    expect(tx(TransactionType.EXPENSE, "Whatever")).toBeNull();
  });

  it("asks rather than guessing in jurisdictions with no derived rules yet", () => {
    expect(taxTreatment("US", TransactionType.INCOME, "Salary")?.treatment).toBe("ask");
  });
});