import { describe, expect, it } from "vitest";
import { getEntitlement, type EntitlementRow } from "../lib/entitlement.js";

/**
 * The daily sweep runs without anybody asking, so the question is not "is this
 * account entitled" but "would we have been allowed to do this if they had
 * pressed the button". The manual route answers that with `assertPro`; these
 * pin the same rule so the two cannot drift.
 */

const DAY = 86_400_000;
const now = new Date("2026-10-20T12:00:00.000Z");

function user(overrides: Partial<EntitlementRow> = {}): EntitlementRow {
  return {
    planStatus: "free",
    trialStartedAt: null,
    trialEndsAt: null,
    bachsSubscriptionStatus: null,
    bachsCurrentPeriodEnd: null,
    bachsCancelAtPeriodEnd: false,
    planExpiresAt: null,
    ...overrides,
  };
}

describe("who the daily sweep may sync", () => {
  it("syncs a paying subscriber", () => {
    expect(getEntitlement(user({ bachsSubscriptionStatus: "active" }), now).isPro).toBe(true);
  });

  it("syncs an account inside a live trial, which is capped inside the run", () => {
    const onTrial = user({
      planStatus: "trial",
      trialStartedAt: new Date(now.getTime() - DAY),
      trialEndsAt: new Date(now.getTime() + 5 * DAY),
    });
    expect(getEntitlement(onTrial, now).isPro).toBe(true);
  });

  it("does not sync a lapsed account whose mailbox is still connected", () => {
    // The common case after a downgrade: the Composio connection outlives the
    // subscription, and sweeping it daily would pay a provider bill for nothing.
    const lapsed = user({
      trialStartedAt: new Date(now.getTime() - 9 * DAY),
      trialEndsAt: new Date(now.getTime() - 2 * DAY),
    });
    expect(getEntitlement(lapsed, now).isPro).toBe(false);
  });

  it("does not sync a one-time term once it has run out", () => {
    // Bank transfer and crypto cannot be re-charged, and a one-time term ends
    // on its own date rather than at a sweep.
    const oneTime = user({ planExpiresAt: new Date(now.getTime() + 5 * DAY) });
    expect(getEntitlement(oneTime, now).isPro).toBe(true);
    expect(getEntitlement(oneTime, new Date(now.getTime() + 6 * DAY)).isPro).toBe(false);
  });

  it("does not sync a never-started account", () => {
    expect(getEntitlement(user(), now).isPro).toBe(false);
  });
});
