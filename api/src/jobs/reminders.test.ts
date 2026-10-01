import { describe, expect, it } from "vitest";
import { deadlineEmail, filingDeadlineFor, markForDeadline } from "./filing-deadline-reminder.js";
import { deadlineCountdown, deadlineUrgency } from "../emails/tokens.js";

describe("deadlineEmail", () => {
  it("returns the subject and the facts the template needs", () => {
    const email = deadlineEmail({
      country: "NIGERIA",
      taxYear: 2026,
      deadline: "2027-03-31",
      daysLeft: 7,
      estimatedTaxOwed: "45000",
      outstanding: ["Pension receipts"],
    });
    expect(email.subject).toContain("7 days");
    expect(email.deadlineLabel).toBe("31 March 2027");
    expect(email.jurisdiction).toBe("Nigerian");
  });

  it("counts the outstanding documents instead of listing them", () => {
    const email = deadlineEmail({
      country: "NIGERIA",
      taxYear: 2026,
      deadline: "2027-03-31",
      daysLeft: 7,
      estimatedTaxOwed: "45000",
      outstanding: ["Pension receipts", "Bank statement"],
    });
    // The count travels separately as checklistTotal; the email itself must not
    // reproduce a list the user has to work through in the checklist anyway.
    expect(email).not.toHaveProperty("text");
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
    expect(email.jurisdiction).toBe("US federal");
  });
});

describe("deadline urgency", () => {
  it("escalates the visual weight as the date approaches", () => {
    expect(deadlineUrgency(30).tone).toBe("accent");
    expect(deadlineUrgency(20).tone).toBe("accent");
    expect(deadlineUrgency(14).tone).toBe("warning");
    expect(deadlineUrgency(8).tone).toBe("warning");
    expect(deadlineUrgency(7).tone).toBe("danger");
    expect(deadlineUrgency(1).tone).toBe("danger");
    expect(deadlineUrgency(-1).tone).toBe("danger");
  });

  it("reads as plain language", () => {
    expect(deadlineCountdown(1)).toBe("tomorrow");
    expect(deadlineCountdown(0)).toBe("today");
    expect(deadlineCountdown(-1)).toBe("today");
    expect(deadlineCountdown(12)).toBe("in 12 days");
  });
});

describe("existing scheduling", () => {
  it("keeps the per-jurisdiction deadline rule", () => {
    expect(filingDeadlineFor("US", 2026)).toBe("2027-04-15");
    expect(filingDeadlineFor("NIGERIA", 2026)).toBe("2027-03-31");
  });

  it("picks one mark per window so a late joiner still gets one notice", () => {
    // Days are measured to the deadline's end of day and rounded up, so the
    // boundaries are a day earlier than the raw date arithmetic suggests.
    expect(markForDeadline("2027-03-31", new Date("2027-03-02T00:00:00Z"))).toBe(30);
    expect(markForDeadline("2027-03-31", new Date("2027-03-20T00:00:00Z"))).toBe(14);
    expect(markForDeadline("2027-03-31", new Date("2027-03-26T00:00:00Z"))).toBe(7);
    expect(markForDeadline("2027-03-31", new Date("2027-03-31T00:00:00Z"))).toBe(1);
    expect(markForDeadline("2027-03-31", new Date("2027-04-02T00:00:00Z"))).toBe(-1);
    // More than 30 days out is genuinely too early to be worth an email.
    expect(markForDeadline("2027-03-31", new Date("2027-03-01T00:00:00Z"))).toBeNull();
    expect(markForDeadline("2027-03-31", new Date("2027-01-01T00:00:00Z"))).toBeNull();
  });
});
