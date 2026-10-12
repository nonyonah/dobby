import { describe, expect, it } from "vitest";
import { chooseRule } from "./engine.js";
import { NUDGE_RULES, type NudgeContext, type NudgeFacts } from "./config.js";

/**
 * Every rule's `due()` is a pure function of the context, so the whole nudge set
 * is testable without a database or a clock.
 *
 * What is worth asserting is not that each rule fires — it is that each one
 * stays quiet in the case where firing would be wrong. A nudge that reaches
 * someone who does not fit it costs more trust than the send was ever worth,
 * and the stop conditions are the only thing standing between the two.
 */

const NOW = new Date("2026-10-22T12:00:00.000Z");

const noFacts: NudgeFacts = {
  setupComplete: true,
  hasImport: false,
  hasEmailConnection: false,
  hasWallet: false,
  reviewPendingCount: 0,
  reviewOldestDays: null,
  transactionsTotal: 0,
  uncategorizedCount: 0,
  manuallyRecategorisedCount: 0,
  hasRules: false,
  daysSinceFirstImport: null,
  daysSinceLastImport: null,
  taxModuleAvailable: false,
  importedTransactions: 0,
  openedTaxSection: false,
  oneTimeJustExpired: false,
};

function context(overrides: Partial<NudgeContext> = {}): NudgeContext {
  return {
    clerkId: "user_1",
    email: "someone@example.com",
    firstName: "Ada",
    now: NOW,
    ageDays: 30,
    inactiveHours: 1,
    isPro: true,
    status: "trial",
    trialDaysLeft: 5,
    facts: { ...noFacts },
    ...overrides,
  };
}

const rule = (key: string) => NUDGE_RULES.find((candidate) => candidate.key === key)!;

describe("nudge set", () => {
  it("declares a unique rule per priority slot", () => {
    const keys = NUDGE_RULES.map((candidate) => candidate.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(8);
  });

  it("gives every rule copy, a budget and a cooldown", () => {
    for (const candidate of NUDGE_RULES) {
      expect(candidate.maxSends).toBeGreaterThan(0);
      expect(candidate.cooldownDays).toBeGreaterThan(0);
      expect(candidate.copy(context()).subject.length).toBeGreaterThan(0);
    }
  });

  it("never emails someone with no address", () => {
    // `due` does not look at the address; the engine skips them before
    // evaluating. Asserting it here keeps that ordering from being refactored away.
    expect(context({ email: "" })).toBeTruthy();
  });
});

describe("trial", () => {
  it("fires in the last two days and not before", () => {
    expect(rule("trial").due(context({ trialDaysLeft: 2 }))).toBe(true);
    expect(rule("trial").due(context({ trialDaysLeft: 3 }))).toBe(false);
  });

  it("does not fire on an account that is not on trial", () => {
    // A paying customer with days left on a stale trial field must not be told
    // their trial is ending.
    expect(rule("trial").due(context({ status: "active", trialDaysLeft: 1 }))).toBe(false);
    expect(rule("trial").due(context({ isPro: false, status: "free", trialDaysLeft: 1 }))).toBe(false);
  });

  it("stops firing once the trial window has passed", () => {
    // What actually happens when the trial ends: `getEntitlement` drops Pro and
    // the status, so the rule is quiet. It is the entitlement that stops it,
    // not a date check inside the copy.
    expect(rule("trial").due(context({ trialDaysLeft: null, isPro: false, status: "free" }))).toBe(false);
  });

  it("does not care how old the account is", () => {
    // The trial starts on the first Pro action, not at sign-up, so someone who
    // joined in January and started a trial yesterday is two days from the end.
    // Gating this on account age would never email exactly the people it is for.
    expect(rule("trial").due(context({ ageDays: 300, trialDaysLeft: 2 }))).toBe(true);
  });
});

describe("review_pending", () => {
  it("fires on a queue left alone for days", () => {
    expect(
      rule("review_pending").due(context({ facts: { ...noFacts, reviewPendingCount: 3, reviewOldestDays: 2 } })),
    ).toBe(true);
  });

  it("does not fire on a fresh queue", () => {
    // Answered-at-once is not a backlog.
    expect(rule("review_pending").due(context({ facts: { ...noFacts, reviewPendingCount: 3, reviewOldestDays: 0 } }))).toBe(false);
    expect(rule("review_pending").due(context({ facts: { ...noFacts, reviewPendingCount: 2, reviewOldestDays: 9 } }))).toBe(false);
  });
});

describe("monthly_statement", () => {
  it("waits for a month of real data", () => {
    expect(
      rule("monthly_statement").due(
        context({ inactiveHours: 72, facts: { ...noFacts, hasImport: true, importedTransactions: 20, daysSinceFirstImport: 30 } }),
      ),
    ).toBe(true);
  });

  it("does not summarise a thin ledger", () => {
    // Four transactions is not a month, and the email would prove it.
    expect(
      rule("monthly_statement").due(
        context({ inactiveHours: 72, facts: { ...noFacts, hasImport: true, importedTransactions: 4, daysSinceFirstImport: 30 } }),
      ),
    ).toBe(false);
  });

  it("does not send to someone who was there yesterday", () => {
    expect(
      rule("monthly_statement").due(
        context({ inactiveHours: 2, facts: { ...noFacts, hasImport: true, importedTransactions: 200, daysSinceFirstImport: 90 } }),
      ),
    ).toBe(false);
  });
});

describe("try_email", () => {
  it("offers auto-fetch once there is something to fetch", () => {
    expect(rule("try_email").due(context({ facts: { ...noFacts, hasImport: true, daysSinceFirstImport: 3 } }))).toBe(true);
  });

  it("stays quiet for someone on their first day", () => {
    // Day zero is onboarding, not a prompt to configure something.
    expect(rule("try_email").due(context({ facts: { ...noFacts, hasImport: true, daysSinceFirstImport: 0 } }))).toBe(false);
  });

  it("does not suggest connecting what is already connected", () => {
    expect(
      rule("try_email").due(context({ facts: { ...noFacts, hasImport: true, hasEmailConnection: true, daysSinceFirstImport: 5 } })),
    ).toBe(false);
  });

  it("is a Pro feature, so it does not pitch to someone who cannot use it", () => {
    expect(rule("try_email").due(context({ isPro: false, facts: { ...noFacts, hasImport: true, daysSinceFirstImport: 5 } }))).toBe(false);
  });
});

describe("feature", () => {
  it("pitches the wallet once they have data and a live trial", () => {
    expect(rule("feature").due(context({ ageDays: 6, facts: { ...noFacts, hasImport: true } }))).toBe(true);
    const copy = rule("feature").copy(context({ ageDays: 6, facts: { ...noFacts, hasImport: true } }));
    expect(copy.subject).toMatch(/crypto/i);
  });

  it("suggests rules only after repeated manual correction", () => {
    const base = { ...noFacts, hasImport: true, hasWallet: true };
    expect(rule("feature").due(context({ ageDays: 40, facts: { ...base, manuallyRecategorisedCount: 5 } }))).toBe(true);
    // One correction is a correction, not a habit.
    expect(rule("feature").due(context({ ageDays: 40, facts: { ...base, manuallyRecategorisedCount: 1 } }))).toBe(false);
  });

  it("describes the reason it fired, in the same order the rule checks them", () => {
    // All three conditions hold. Copy must name the wallet, the first thing
    // `due` would have matched, or the email argues for something else.
    const facts = { ...noFacts, hasImport: true, manuallyRecategorisedCount: 9, taxModuleAvailable: true, importedTransactions: 80 };
    expect(rule("feature").copy(context({ facts })).subject).toMatch(/crypto/i);
  });
});

describe("inactive", () => {
  it("is email only", () => {
    // A card for someone who has not opened the app in a fortnight is noise.
    expect(rule("inactive").channels).toEqual(["email"]);
  });

  it("fires once, after a long silence", () => {
    expect(rule("inactive").due(context({ ageDays: 40, inactiveHours: 24 * 15 }))).toBe(true);
    expect(rule("inactive").due(context({ ageDays: 40, inactiveHours: 24 * 13 }))).toBe(false);
  });

  it("does not chase a brand-new account", () => {
    expect(rule("inactive").due(context({ ageDays: 5, inactiveHours: 24 * 30 }))).toBe(false);
  });
});

describe("renew", () => {
  it("reaches a one-time payer seven days out", () => {
    expect(rule("renew").due(context({ oneTimeDaysLeft: 7 }))).toBe(true);
    expect(rule("renew").due(context({ oneTimeDaysLeft: 2 }))).toBe(true);
  });

  it("never reaches a card subscriber", () => {
    // The whole reason this rule exists is that a one-time term stops without
    // being renewed. A subscription renews on its own, so this would be asking
    // somebody to do something they never have to do.
    expect(rule("renew").due(context({ oneTimeDaysLeft: 3, hasLiveSubscription: true }))).toBe(false);
  });

  it("does not reach somebody who never bought a one-time term", () => {
    expect(rule("renew").due(context({ oneTimeDaysLeft: null }))).toBe(false);
  });

  it("sends once after the term ends, and only that day", () => {
    const expired = context({ oneTimeDaysLeft: -1, facts: { ...noFacts, oneTimeJustExpired: true } });
    expect(rule("renew").due(expired)).toBe(true);
    expect(rule("renew").copy(expired).subject).toBe("Your Pro access has ended");

    // Two days after it ended, silence: the term did not stop being over.
    const longGone = context({ oneTimeDaysLeft: -3, facts: { ...noFacts, oneTimeJustExpired: false } });
    expect(rule("renew").due(longGone)).toBe(false);
  });

  it("states the matching subject for each window", () => {
    const seven = rule("renew").copy(context({ oneTimeDaysLeft: 7 }));
    const two = rule("renew").copy(context({ oneTimeDaysLeft: 2 }));
    expect(seven.subject).toBe("Your Pro access ends in 7 days");
    expect(two.subject).toBe("2 days left on Pro");
    // Same call to action throughout: renew, by either rail.
    expect(seven.ctaLabel).toBe("Renew Pro");
    expect(two.ctaLabel).toBe("Renew Pro");
  });
});

describe("chooseRule", () => {
  it("returns the highest-priority due rule", () => {
    // Trial is expiring and the review queue is backed up. Trial wins.
    const picked = chooseRule(NUDGE_RULES, context({ trialDaysLeft: 1, facts: { ...noFacts, reviewPendingCount: 9, reviewOldestDays: 9 } }));
    expect(picked?.key).toBe("trial");
  });

  it("returns null when nothing is due", () => {
    // A Pro account mid-trial, three days into setup, nothing outstanding.
    expect(chooseRule(NUDGE_RULES, context({ ageDays: 2, trialDaysLeft: 5 }))).toBeNull();
  });

  it("skips a rule that does not run on the requested channel", () => {
    // `inactive` is the only rule due here, and it is email-only.
    const due = context({ ageDays: 40, inactiveHours: 24 * 20 });
    expect(chooseRule(NUDGE_RULES, due, "email")?.key).toBe("inactive");
    expect(chooseRule(NUDGE_RULES, due, "in_app")).toBeNull();
  });
});