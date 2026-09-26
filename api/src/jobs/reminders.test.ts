import { describe, expect, it } from "vitest";
import { deadlineEmail, filingDeadlineFor, markForDeadline } from "./filing-deadline-reminder.js";

describe("filingDeadlineFor", () => {
  it("uses April 15 (US) and March 31 (Nigeria) of the year after the tax year", () => {
    expect(filingDeadlineFor("US", 2026)).toBe("2027-04-15");
    expect(filingDeadlineFor("NIGERIA", 2026)).toBe("2027-03-31");
  });
});

describe("markForDeadline", () => {
  const deadline = "2027-04-15";
  it("returns null when the deadline is more than 30 days out", () => {
    expect(markForDeadline(deadline, new Date("2027-01-01T00:00:00Z"))).toBeNull();
  });
  it("walks the 30/14/7/1 windows", () => {
    expect(markForDeadline(deadline, new Date("2027-03-20T00:00:00Z"))).toBe(30);
    expect(markForDeadline(deadline, new Date("2027-04-05T00:00:00Z"))).toBe(14);
    expect(markForDeadline(deadline, new Date("2027-04-10T00:00:00Z"))).toBe(7);
    expect(markForDeadline(deadline, new Date("2027-04-15T23:59:58Z"))).toBe(1);
  });
  it("returns the overdue mark once the deadline passes", () => {
    expect(markForDeadline(deadline, new Date("2027-04-16T00:00:01Z"))).toBe(-1);
  });
});

describe("deadlineEmail", () => {
  it("names the deadline, the amount owed, and outstanding documents", () => {
    const email = deadlineEmail({
      country: "NIGERIA",
      taxYear: 2026,
      deadline: "2027-03-31",
      daysLeft: 7,
      estimatedTaxOwed: "45000",
      outstanding: ["Pension receipts"],
    });
    expect(email.subject).toContain("7 days left");
    expect(email.text).toContain("March 31, 2027");
    expect(email.text).toContain("45000");
    expect(email.text).toContain("Pension receipts");
    expect(email.text).toContain("doesn't prepare or file returns");
  });
  it("switches to the overdue subject after the deadline", () => {
    const email = deadlineEmail({
      country: "US",
      taxYear: 2026,
      deadline: "2027-04-15",
      daysLeft: -3,
      estimatedTaxOwed: "1200",
      outstanding: [],
    });
    expect(email.subject).toContain("passed");
    expect(email.text).toContain("All checklist documents are marked ready.");
  });
});
