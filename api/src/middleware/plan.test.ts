import { describe, expect, it } from "vitest";
import { TRIAL_DAYS, computeEffectivePlan, computeLocalPlan, trialEndsAt } from "./plan.js";

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY);
const inDays = (days: number) => new Date(Date.now() + days * DAY);

describe("computeLocalPlan", () => {
  it("keeps a fresh signup window on TRIAL", () => {
    expect(computeLocalPlan({ plan: "TRIAL", trialStartedAt: daysAgo(2) })).toBe("TRIAL");
  });

  it("expires a window that has run past 7 days", () => {
    expect(computeLocalPlan({ plan: "TRIAL", trialStartedAt: daysAgo(TRIAL_DAYS + 1) })).toBe("EXPIRED");
  });

  it("never revives stored ACTIVE or EXPIRED", () => {
    expect(computeLocalPlan({ plan: "ACTIVE", trialStartedAt: daysAgo(60) })).toBe("ACTIVE");
    expect(computeLocalPlan({ plan: "EXPIRED", trialStartedAt: daysAgo(1) })).toBe("EXPIRED");
  });

  it("fails closed when the row has no trial clock", () => {
    expect(computeLocalPlan({ plan: "TRIAL", trialStartedAt: null })).toBe("EXPIRED");
  });
});

describe("computeEffectivePlan with a Bachs subscription", () => {
  it("treats an active or past-due subscription as Pro even after the signup window", () => {
    const row = { plan: "TRIAL", trialStartedAt: daysAgo(TRIAL_DAYS + 5) };
    expect(computeEffectivePlan({ ...row, bachsSubscriptionStatus: "active" })).toBe("ACTIVE");
    expect(computeEffectivePlan({ ...row, bachsSubscriptionStatus: "past_due" })).toBe("ACTIVE");
  });

  it("keeps a Bachs trial as TRIAL once the signup window has lapsed", () => {
    const plan = computeEffectivePlan({
      plan: "TRIAL",
      trialStartedAt: daysAgo(TRIAL_DAYS + 5),
      bachsSubscriptionStatus: "trialing",
      bachsTrialEnd: inDays(9),
    });
    expect(plan).toBe("TRIAL");
  });

  it("falls back to the local clock when the subscription is canceled", () => {
    const row = { plan: "TRIAL", bachsSubscriptionStatus: "canceled" };
    expect(computeEffectivePlan({ ...row, trialStartedAt: daysAgo(3) })).toBe("TRIAL");
    expect(computeEffectivePlan({ ...row, trialStartedAt: daysAgo(TRIAL_DAYS + 1) })).toBe("EXPIRED");
  });

  it("prefers subscription state over a stale stored plan", () => {
    expect(
      computeEffectivePlan({ plan: "TRIAL", trialStartedAt: daysAgo(TRIAL_DAYS + 3), bachsSubscriptionStatus: "active" }),
    ).toBe("ACTIVE");
  });
});

describe("trialEndsAt", () => {
  it("reports the Bachs trial end while trialing", () => {
    const end = inDays(9);
    expect(
      trialEndsAt({ plan: "TRIAL", trialStartedAt: daysAgo(3), bachsSubscriptionStatus: "trialing", bachsTrialEnd: end }),
    ).toEqual(end);
  });

  it("falls back to the local window when Bachs has not sent a trial end", () => {
    const started = daysAgo(3);
    expect(trialEndsAt({ plan: "TRIAL", trialStartedAt: started, bachsSubscriptionStatus: "trialing" })).toEqual(
      new Date(started.getTime() + TRIAL_DAYS * DAY),
    );
  });

  it("reports the signup window end with no subscription", () => {
    const started = daysAgo(3);
    expect(trialEndsAt({ plan: "TRIAL", trialStartedAt: started })).toEqual(
      new Date(started.getTime() + TRIAL_DAYS * DAY),
    );
    expect(trialEndsAt({ plan: "TRIAL", trialStartedAt: null })).toBeNull();
  });
});

describe("computeEffectivePlan with a one-time term", () => {
  it("keeps stored ACTIVE alive while the term is in the future", () => {
    expect(
      computeEffectivePlan({ plan: "ACTIVE", trialStartedAt: daysAgo(60), planExpiresAt: inDays(10) }),
    ).toBe("ACTIVE");
  });

  it("expires stored ACTIVE once the term lapses", () => {
    expect(
      computeEffectivePlan({ plan: "ACTIVE", trialStartedAt: daysAgo(60), planExpiresAt: daysAgo(1) }),
    ).toBe("EXPIRED");
  });

  it("prefers a live Bachs subscription over a lapsed term", () => {
    expect(
      computeEffectivePlan({ plan: "ACTIVE", trialStartedAt: daysAgo(60), planExpiresAt: daysAgo(1), bachsSubscriptionStatus: "active" }),
    ).toBe("ACTIVE");
  });
});
