import { describe, expect, it } from "vitest";
import { addMonths, newOneTimeReference } from "./one-time.js";

/**
 * The date maths on a one-time purchase decides when a customer's access ends,
 * and the renewal reminders fire against that same date. An off-by-one here
 * emails somebody about an end date nobody ever told them about.
 */
describe("addMonths", () => {
  it("adds whole calendar months", () => {
    expect(addMonths(new Date("2026-10-22T12:00:00.000Z"), 1).toISOString()).toBe("2026-11-22T12:00:00.000Z");
    expect(addMonths(new Date("2026-01-15T12:00:00.000Z"), 3).toISOString()).toBe("2026-04-15T12:00:00.000Z");
  });

  it("lands on the last day of a shorter month rather than overflowing", () => {
    // 31 Jan + 1 month has no 31st to land on. Rolling into March would grant
    // two days more than was paid for and push the reminders out with it.
    expect(addMonths(new Date("2026-01-31T12:00:00.000Z"), 1).toISOString()).toBe("2026-02-28T12:00:00.000Z");
    // A leap February, so the clamp is not just always the 28th.
    expect(addMonths(new Date("2028-01-31T12:00:00.000Z"), 1).toISOString()).toBe("2028-02-29T12:00:00.000Z");
  });

  it("goes backwards for a refund without touching the time of day", () => {
    expect(addMonths(new Date("2026-03-22T09:30:00.000Z"), -1).toISOString()).toBe("2026-02-22T09:30:00.000Z");
  });

  it("does not mutate the date it was given", () => {
    const from = new Date("2026-01-31T12:00:00.000Z");
    addMonths(from, 1);
    expect(from.toISOString()).toBe("2026-01-31T12:00:00.000Z");
  });
});

describe("newOneTimeReference", () => {
  it("is unique per attempt", () => {
    // A retry after a failed or expired checkout has to be a distinct order. A
    // stable reference would collapse the second attempt onto the first.
    const refs = new Set(Array.from({ length: 50 }, () => newOneTimeReference("user_2abc")));
    expect(refs.size).toBe(50);
  });

  it("carries the user so an order can be traced from a Bachs dashboard", () => {
    // Truncated to 12 characters: enough to recognise the account in a Bachs
    // dashboard, short enough that the reference stays readable.
    const clerkId = "user_2abcDEFghiJKL";
    expect(newOneTimeReference(clerkId)).toMatch(new RegExp(`^dobby_once_${clerkId.slice(0, 12)}_`));
    // A short id is not padded or mangled, just used whole.
    expect(newOneTimeReference("user_2abc")).toMatch(/^dobby_once_user_2abc_/);
  });
});