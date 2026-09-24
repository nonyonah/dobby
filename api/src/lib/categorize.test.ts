import { describe, expect, it } from "vitest";
import { suggestCategory, type CategoryRef, type RuleRef } from "./categorize.js";

const categories: CategoryRef[] = [
  { id: "c-util", name: "Utilities" },
  { id: "c-food", name: "Groceries" },
  { id: "c-rent", name: "Housing" },
  { id: "c-move", name: "Transport" },
  { id: "c-fun", name: "Dining" },
  { id: "c-shop", name: "Shopping" },
  { id: "c-school", name: "Education" },
  { id: "c-pay", name: "Income" },
  { id: "c-inv", name: "Investments" },
];

const noRules: RuleRef[] = [];

describe("suggestCategory — Nigeria telco/power pack", () => {
  it.each([
    "GLO AIRTIME RECHARGE 0803",
    "MTN data bundle purchase",
    "Airtel airtime topup",
    "9mobile recharge",
    "IKEJA ELECTRIC BILL JAN",
    "EKO ELECTRICITY PREPAID TOKEN",
    "DSTV subscription renewal",
  ])("maps %s to Utilities", (descriptor) => {
    expect(suggestCategory(descriptor, "EXPENSE", categories, noRules)?.categoryId).toBe("c-util");
  });

  it("does not match short tokens inside longer words", () => {
    expect(suggestCategory("Global ventures transfer", "EXPENSE", categories, noRules)).toBeNull();
  });

  it("matches data only as a whole word", () => {
    expect(suggestCategory("Data bundle", "EXPENSE", categories, noRules)?.categoryId).toBe("c-util");
    expect(suggestCategory("Database subscription", "EXPENSE", categories, noRules)).toBeNull();
  });
});

describe("suggestCategory — general behavior", () => {
  it("keeps existing Western fixtures working", () => {
    expect(suggestCategory("Whole Foods Market", "EXPENSE", categories, noRules)?.categoryId).toBe("c-food");
    expect(suggestCategory("Rent Payment", "EXPENSE", categories, noRules)?.categoryId).toBe("c-rent");
    expect(suggestCategory("Uber Ride", "EXPENSE", categories, noRules)?.categoryId).toBe("c-move");
  });

  it("prefers user rules over keywords", () => {
    const rules: RuleRef[] = [{ matcher: "mtn", categoryId: "c-fun" }];
    expect(suggestCategory("MTN data", "EXPENSE", categories, rules)).toEqual({
      categoryId: "c-fun",
      method: "rule",
    });
  });

  it("resolves custom category names through aliases", () => {
    const custom: CategoryRef[] = [
      { id: "bills", name: "Bills" },
      { id: "feeding", name: "Feeding" },
    ];
    expect(suggestCategory("GLO airtime", "EXPENSE", custom, noRules)?.categoryId).toBe("bills");
    expect(suggestCategory("Shoprite run", "EXPENSE", custom, noRules)?.categoryId).toBe("feeding");
  });

  it("never assigns income keywords to expenses and vice versa", () => {
    expect(suggestCategory("Salary advance", "EXPENSE", categories, noRules)).toBeNull();
    expect(suggestCategory("Monthly Salary", "INCOME", categories, noRules)?.categoryId).toBe("c-pay");
  });

  it("returns null when nothing matches", () => {
    expect(suggestCategory("NIP transfer to Adaeze", "EXPENSE", categories, noRules)).toBeNull();
  });
});
