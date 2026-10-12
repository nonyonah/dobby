import { describe, expect, it } from "vitest";
import { addMonths, renewalKey } from "./renewals.js";

/**
 * The renewal loop charges real money on a schedule with no customer present,
 * so the two things it gets wrong are charging the same period twice and
 * advancing a date that does not match the period actually bought.
 */

describe("renewalKey", () => {
  it("is one key per customer per month", () => {
    // The idempotency key is what stops a retry after a timeout charging twice,
    // so it must be stable across attempts and distinct across periods.
    const a = renewalKey("user_1", new Date("2026-11-04T09:00:00.000Z"));
    const b = renewalKey("user_1", new Date("2026-11-29T23:59:00.000Z"));
    const nextMonth = renewalKey("user_1", new Date("2026-12-01T00:30:00.000Z"));
    expect(a).toBe(b);
    expect(a).not.toBe(nextMonth);
  });

  it("separates customers from each other", () => {
    const at = new Date("2026-11-04T09:00:00.000Z");
    expect(renewalKey("user_1", at)).not.toBe(renewalKey("user_2", at));
  });
});

describe("addMonths", () => {
  it("advances by whole calendar months", () => {
    expect(addMonths(new Date("2026-10-22T12:00:00.000Z"), 1).toISOString()).toBe("2026-11-22T12:00:00.000Z");
    expect(addMonths(new Date("2026-10-22T12:00:00.000Z"), 12).toISOString()).toBe("2027-10-22T12:00:00.000Z");
  });

  it("clamps to the last day of a shorter month instead of overflowing", () => {
    // Rolling 31 January into March would charge a month early and grant two days
    // more than was paid for.
    expect(addMonths(new Date("2026-01-31T12:00:00.000Z"), 1).toISOString()).toBe("2026-02-28T12:00:00.000Z");
    expect(addMonths(new Date("2028-01-31T12:00:00.000Z"), 1).toISOString()).toBe("2028-02-29T12:00:00.000Z");
  });

  it("keeps the time of day, so the hour a charge lands does not drift", () => {
    expect(addMonths(new Date("2026-03-15T09:15:00.000Z"), 1).toISOString()).toBe("2026-04-15T09:15:00.000Z");
  });

  it("does not mutate the date it was given", () => {
    const from = new Date("2026-01-31T12:00:00.000Z");
    addMonths(from, 1);
    expect(from.toISOString()).toBe("2026-01-31T12:00:00.000Z");
  });
});