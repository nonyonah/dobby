import { describe, expect, it } from "vitest";
import { TRIAL_DAYS, getEntitlement, trialWindowFrom, type EntitlementRow } from "../lib/entitlement.js";

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

const liveTrial = { trialStartedAt: new Date(now.getTime() - DAY), trialEndsAt: new Date(now.getTime() + 3 * DAY) };

describe("trial window", () => {
  it("runs for the configured length", () => {
    expect(TRIAL_DAYS).toBe(14);
    const { trialStartedAt, trialEndsAt } = trialWindowFrom(now);
    expect(trialEndsAt!.getTime() - trialStartedAt.getTime()).toBe(TRIAL_DAYS * DAY);
  });

  it("measures from the given instant, not the device clock", () => {
    const { trialEndsAt } = trialWindowFrom(now);
    expect(trialEndsAt!.toISOString()).toBe("2026-11-03T12:00:00.000Z");
  });
});

describe("getEntitlement", () => {
  it("grants Pro inside a live trial window", () => {
    const entitlement = getEntitlement(user({ planStatus: "trial", ...liveTrial }), now);
    expect(entitlement.isPro).toBe(true);
    expect(entitlement.status).toBe("trial");
    expect(entitlement.trialDaysLeft).toBe(3);
  });

  it("withholds Pro once the window closes", () => {
    const entitlement = getEntitlement(
      user({ planStatus: "trial", trialStartedAt: new Date(now.getTime() - 9 * DAY), trialEndsAt: new Date(now.getTime() - 2 * DAY) }),
      now,
    );
    expect(entitlement.isPro).toBe(false);
    expect(entitlement.trialDaysLeft).toBeNull();
  });

  it("never grants a trial to someone who never started one", () => {
    // The regression this replaces: a Bachs subscription in `trialing` used to
    // mean Pro on its own. The trial is now started deliberately.
    expect(getEntitlement(user(), now).isPro).toBe(false);
  });

  it("grants Pro on a paid subscription with no trial at all", () => {
    const entitlement = getEntitlement(user({ planStatus: "pro", bachsSubscriptionStatus: "active" }), now);
    expect(entitlement.isPro).toBe(true);
    expect(entitlement.status).toBe("pro");
  });

  it("keeps Pro while a renewal is retrying", () => {
    expect(getEntitlement(user({ bachsSubscriptionStatus: "past_due" }), now).isPro).toBe(true);
  });

  it("keeps access after a cancel until the paid period actually ends", () => {
    const stillPaid = getEntitlement(
      user({ bachsSubscriptionStatus: "canceled", bachsCancelAtPeriodEnd: true, bachsCurrentPeriodEnd: new Date(now.getTime() + 5 * DAY) }),
      now,
    );
    expect(stillPaid.isPro).toBe(true);

    const periodOver = getEntitlement(
      user({ bachsSubscriptionStatus: "canceled", bachsCancelAtPeriodEnd: true, bachsCurrentPeriodEnd: new Date(now.getTime() - DAY) }),
      now,
    );
    expect(periodOver.isPro).toBe(false);
  });

  it("drops access the moment a cancel takes effect", () => {
    expect(getEntitlement(user({ planStatus: "canceled", bachsSubscriptionStatus: "canceled", bachsCancelAtPeriodEnd: false }), now).isPro).toBe(false);
  });

  it("keeps Pro on an unexpired one-time term", () => {
    expect(getEntitlement(user({ planExpiresAt: new Date(now.getTime() + DAY) }), now).isPro).toBe(true);
    expect(getEntitlement(user({ planExpiresAt: new Date(now.getTime() - DAY) }), now).isPro).toBe(false);
  });

  it("lets a paid subscription outrank a lapsed trial", () => {
    // Someone who pays with four trial days left keeps Pro for the paid period
    // instead of dropping to nothing on day eight.
    const entitlement = getEntitlement(
      user({ trialStartedAt: new Date(now.getTime() - 9 * DAY), trialEndsAt: new Date(now.getTime() - 2 * DAY), bachsSubscriptionStatus: "active" }),
      now,
    );
    expect(entitlement.isPro).toBe(true);
    expect(entitlement.trialDaysLeft).toBeNull();
  });

  it("reports no days left for an account that never started a trial", () => {
    expect(getEntitlement(user({ bachsSubscriptionStatus: "active" }), now).trialDaysLeft).toBeNull();
  });

  it("rounds a partial day up, so 30 minutes still reads as a day", () => {
    const entitlement = getEntitlement(
      user({ planStatus: "trial", trialStartedAt: new Date(now.getTime() - DAY), trialEndsAt: new Date(now.getTime() + 30 * 60 * 1000) }),
      now,
    );
    expect(entitlement.trialDaysLeft).toBe(1);
  });

  it("treats a missing user as free rather than throwing", () => {
    expect(getEntitlement(null, now)).toEqual({ isPro: false, status: "free", trialDaysLeft: null, trialEndsAt: null });
  });
});