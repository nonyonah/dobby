import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `assertWalletCapacity` reads the user's plan and their wallet count, so the
 * two Prisma calls it makes are stubbed rather than hitting a database. These
 * tests cover the entitlement decision only — the plan math itself is covered
 * by plan.test.ts.
 */
const state = {
  user: null as null | {
    plan: string;
    trialStartedAt: Date | null;
    bachsSubscriptionStatus?: string | null;
    bachsTrialEnd?: Date | null;
    planExpiresAt?: Date | null;
  },
  walletCount: 0,
};

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () => state.user),
      update: vi.fn(async () => ({})),
    },
    walletAccount: {
      count: vi.fn(async () => state.walletCount),
    },
  },
}));

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY);

import { FREE_WALLET_LIMIT, assertWalletCapacity } from "./plan.js";

const expiredUser = { plan: "EXPIRED", trialStartedAt: daysAgo(60) };
const trialUser = { plan: "TRIAL", trialStartedAt: daysAgo(2) };
const proUser = { plan: "TRIAL", trialStartedAt: daysAgo(60), bachsSubscriptionStatus: "active" };

describe("assertWalletCapacity", () => {
  beforeEach(() => {
    state.walletCount = 0;
    state.user = expiredUser;
  });

  it("lets a free account connect their one wallet", async () => {
    state.user = trialUser;
    state.walletCount = FREE_WALLET_LIMIT - 1;
    await expect(assertWalletCapacity("user_1")).resolves.toBeUndefined();
  });

  it("blocks a second wallet on the free tier", async () => {
    state.user = expiredUser;
    state.walletCount = FREE_WALLET_LIMIT;
    await expect(assertWalletCapacity("user_1")).rejects.toMatchObject({ statusCode: 402, code: "UPGRADE_REQUIRED" });
  });

  it("does not count the wallet against a Pro account", async () => {
    state.user = proUser;
    state.walletCount = 25;
    await expect(assertWalletCapacity("user_1")).resolves.toBeUndefined();
  });

  it("treats past_due as Pro, so a failed renewal does not lock wallets", async () => {
    state.user = { ...proUser, bachsSubscriptionStatus: "past_due" };
    state.walletCount = 12;
    await expect(assertWalletCapacity("user_1")).resolves.toBeUndefined();
  });

  it("rejects an unauthenticated request", async () => {
    await expect(assertWalletCapacity(undefined)).rejects.toMatchObject({ statusCode: 401, code: "UNAUTHENTICATED" });
  });

  it("rejects a request for an account that no longer exists", async () => {
    state.user = null;
    await expect(assertWalletCapacity("user_gone")).rejects.toMatchObject({ statusCode: 401 });
  });

  it("says the limit in the message so the UI can explain it", async () => {
    state.user = expiredUser;
    state.walletCount = FREE_WALLET_LIMIT;
    await expect(assertWalletCapacity("user_1")).rejects.toThrow(new RegExp(String(FREE_WALLET_LIMIT)));
  });
});