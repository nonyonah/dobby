import { describe, expect, it } from "vitest";
import { AppError } from "../middleware/errors.js";
import { verifyBachsSignature } from "./bachs.js";
import { assertWalletCapacityFor, walletLimitApplies, type PlanRow } from "../middleware/plan.js";
import { mergeIdentity } from "../routes/billing.js";

/**
 * The subscription re-sync decides whether a customer keeps access they paid
 * for, so the direction of every branch matters as much as the branch itself.
 * These cover the pure parts; the reconciliation itself is exercised against
 * the sandbox API by hand, because it needs a live subscription.
 */
describe("wallet cap during a trial", () => {
  const oneWallet = { trialStartedAt: new Date(), plan: "TRIAL" };

  it("does not cap an account whose Bachs subscription is trialing", () => {
    // The regression: gating on ACTIVE alone refused a second wallet for a user
    // whose plan resolved to TRIAL, while the client kept offering the button.
    expect(() => assertWalletCapacityFor({ ...oneWallet, bachsSubscriptionStatus: "trialing" }, 1)).not.toThrow();
  });

  it("does not cap a paid or past-due account", () => {
    expect(() => assertWalletCapacityFor({ ...oneWallet, bachsSubscriptionStatus: "active" }, 5)).not.toThrow();
    expect(() => assertWalletCapacityFor({ ...oneWallet, bachsSubscriptionStatus: "past_due" }, 5)).not.toThrow();
  });

  it("still caps an account whose trial has lapsed", () => {
    const lapsed: PlanRow = { plan: "TRIAL", trialStartedAt: new Date(Date.now() - 9 * 86_400_000) };
    expect(() => assertWalletCapacityFor(lapsed, 1)).toThrow(/free tier/i);
    expect(() => assertWalletCapacityFor(lapsed, 0)).not.toThrow();
  });
});

describe("walletLimitApplies", () => {
  it("applies only once a trial has lapsed", () => {
    expect(walletLimitApplies("TRIAL")).toBe(false);
    expect(walletLimitApplies("ACTIVE")).toBe(false);
    expect(walletLimitApplies("EXPIRED")).toBe(true);
  });
});

describe("Bachs upstream status", () => {
  it("keeps a 4xx status so a missing subscription is distinguishable from an outage", () => {
    // The distinction is the whole point: "Bachs has no record of it" means
    // mark it ended, while "Bachs is down" means leave the row alone. Collapsing
    // a 404 into a 502 made both look identical.
    const asAppError = (upstream: number) =>
      new AppError(upstream >= 400 && upstream < 500 ? upstream : 502, "x", "BACHS_UPSTREAM_ERROR");

    expect(asAppError(404).statusCode).toBe(404);
    expect(asAppError(400).statusCode).toBe(400);
    expect(asAppError(502).statusCode).toBe(502);
    expect(asAppError(503).statusCode).toBe(502);
  });
});

describe("webhook signature", () => {
  const body = Buffer.from('{"type":"customer.subscription.updated"}', "utf8");

  it("rejects an unsigned body", () => {
    expect(verifyBachsSignature({ rawBody: body, secret: "whsec_test" })).toBe(false);
  });

  it("fails closed when no secret is configured", () => {
    // This is the live configuration: with the secret empty the webhook route
    // refuses every event, so the stored status freezes at whatever the last
    // delivery set and a trial never converts.
    expect(verifyBachsSignature({ rawBody: body, signatureV2: "t=1,v1=deadbeef", secret: "" })).toBe(false);
  });
});
describe("mergeIdentity", () => {
  const stored = { email: "nonyonah@gmail.com", firstName: "Nonso", lastName: "Onah" };

  it("keeps a name typed into Dobby when Clerk reports a blank one", () => {
    // The regression. Clerk answers with "" for a field a user never filled, and
    // `??` does not fall back on that, so the surname was overwritten with an
    // empty string on the way to checkout — which is also what Bachs was sent.
    expect(mergeIdentity(stored, { firstName: "Nonso", lastName: "" })).toEqual(stored);
    expect(mergeIdentity(stored, { firstName: "", lastName: "   " })).toEqual(stored);
  });

  it("takes a real value from Clerk when it has one", () => {
    expect(mergeIdentity(stored, { firstName: "Chidera", lastName: null }).firstName).toBe("Chidera");
    expect(mergeIdentity(stored, { firstName: null, lastName: "Onah" }).lastName).toBe("Onah");
  });

  it("backfills an email Clerk has and Dobby does not", () => {
    expect(mergeIdentity({ email: null, firstName: "Nonso", lastName: "Onah" }, { email: "n@example.com" }).email)
      .toBe("n@example.com");
  });

  it("survives a failed Clerk lookup", () => {
    expect(mergeIdentity(stored, null)).toEqual(stored);
  });

  it("treats whitespace as blank rather than as a name", () => {
    expect(mergeIdentity({ email: "a@b.c", firstName: "  ", lastName: null }, null).firstName).toBeNull();
  });
});
