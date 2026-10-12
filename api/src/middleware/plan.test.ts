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
    expect(TRIAL_DAYS).toBe(7);
    const { trialStartedAt, trialEndsAt } = trialWindowFrom(now);
    expect(trialEndsAt!.getTime() - trialStartedAt.getTime()).toBe(TRIAL_DAYS * DAY);
  });

  it("measures from the given instant, not the device clock", () => {
    const { trialEndsAt } = trialWindowFrom(now);
    expect(trialEndsAt!.toISOString()).toBe("2026-10-27T12:00:00.000Z");
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
    expect(getEntitlement(null, now)).toEqual({ isPro: false, status: "free", trialStarted: false, trialDaysLeft: null, trialEndsAt: null });
  });

  it("tells an account that never started a trial apart from one whose trial lapsed", () => {
    // Both are `isPro: false`, and only the difference between them decides
    // whether the app says "your trial has ended" — which to a brand-new account
    // is the single most obviously wrong thing it could say.
    const never = getEntitlement(user({}), now);
    const lapsed = getEntitlement(
      user({ trialStartedAt: new Date(now.getTime() - 9 * DAY), trialEndsAt: new Date(now.getTime() - 2 * DAY) }),
      now,
    );

    expect(never.isPro).toBe(false);
    expect(never.trialStarted).toBe(false);

    expect(lapsed.isPro).toBe(false);
    expect(lapsed.trialStarted).toBe(true);
  });

  it("reports a trial started on a live or paid account", () => {
    expect(
      getEntitlement(user({ trialStartedAt: new Date(now.getTime() - DAY), trialEndsAt: new Date(now.getTime() + DAY) }), now).trialStarted,
    ).toBe(true);
  });
});

/**
 * A one-time purchase and a subscription are both "money in", and either can
 * outlive the other. These are the cases where getting it wrong charges someone
 * for something they already paid for, or cuts off a customer who paid.
 */
describe("one-time and subscription access", () => {
  it("keeps access on a one-time purchase alone", () => {
    expect(getEntitlement(user({ planExpiresAt: new Date(now.getTime() + 5 * DAY) }), now).isPro).toBe(true);
    expect(getEntitlement(user({ planExpiresAt: new Date(now.getTime() - DAY) }), now).isPro).toBe(false);
  });

  it("runs to the later of the two, not whichever was bought first", () => {
    // Subscription has three days left, one-time purchase has thirty. The
    // customer paid for thirty days of access and gets thirty days of it.
    const both = user({
      bachsSubscriptionStatus: "active",
      bachsCurrentPeriodEnd: new Date(now.getTime() + 3 * DAY),
      planExpiresAt: new Date(now.getTime() + 30 * DAY),
    });
    expect(getEntitlement(both, now).isPro).toBe(true);
    expect(getEntitlement(both, new Date(now.getTime() + 10 * DAY)).isPro).toBe(true);
  });

  it("keeps the subscription when it outlives the one-time purchase", () => {
    const both = user({
      bachsSubscriptionStatus: "active",
      bachsCurrentPeriodEnd: new Date(now.getTime() + 30 * DAY),
      planExpiresAt: new Date(now.getTime() + DAY),
    });
    expect(getEntitlement(both, new Date(now.getTime() + 5 * DAY)).isPro).toBe(true);
    // And it really does end when the last of them ends.
    expect(getEntitlement(both, new Date(now.getTime() + 31 * DAY)).isPro).toBe(false);
  });

  it("lets a one-time term carry a lapsed subscription", () => {
    // The subscription has ended but a prepaid term is still running: still Pro.
    expect(
      getEntitlement(
        user({
          bachsSubscriptionStatus: "canceled",
          bachsCurrentPeriodEnd: new Date(now.getTime() - 2 * DAY),
          planExpiresAt: new Date(now.getTime() + 20 * DAY),
        }),
        now,
      ).isPro,
    ).toBe(true);
  });

  it("ends access when a cancel-at-period-end period runs out", () => {
    const canceled = user({
      bachsSubscriptionStatus: "canceled",
      bachsCancelAtPeriodEnd: true,
      bachsCurrentPeriodEnd: new Date(now.getTime() + DAY),
    });
    expect(getEntitlement(canceled, now).isPro).toBe(true);
    expect(getEntitlement(canceled, new Date(now.getTime() + 2 * DAY)).isPro).toBe(false);
  });

  it("keeps a paying account on Pro when the period end was never recorded", () => {
    // Losing access because a date is missing would show a customer who paid
    // nothing; the missing date is recoverable, the complaint is not.
    expect(getEntitlement(user({ bachsSubscriptionStatus: "active" }), now).isPro).toBe(true);
  });

  it("ends a stale 'active' subscription once its period has passed", () => {
    // Bachs drops the status eventually, but a missed webhook leaves it 'active'
    // forever. The date is the thing that decides.
    expect(
      getEntitlement(
        user({ bachsSubscriptionStatus: "active", bachsCurrentPeriodEnd: new Date(now.getTime() - DAY) }),
        now,
      ).isPro,
    ).toBe(false);
  });
});
