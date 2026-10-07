/**
 * Concurrency regression guard for grantProTermFromPayment.
 *
 * A crypto checkout completes through two independent paths at once: the
 * provider webhook and the in-browser poll. Both call this function for the same
 * txRef, so the `pending` -> `paid` transition must be claimed exactly once or a
 * user is granted more time than they paid for.
 *
 * Writes to a real database, so it is opt-in:
 *   DOBBY_DB_PARITY=1 DATABASE_URL=postgresql://... npx vitest run src/lib/payment-grant.verify.test.ts
 */
import { describe, expect, it } from "vitest";
import { prisma } from "./prisma.js";
import { grantProTermFromPayment } from "./payment-grant.js";
import { AppError } from "../middleware/errors.js";

const RUN = process.env.DOBBY_DB_PARITY === "1";

const OWNER = "user_grant_verify";

async function reset() {
  await prisma.payment.deleteMany({ where: { ownerClerkId: OWNER } });
  await prisma.user.deleteMany({ where: { clerkId: OWNER } });
  await prisma.user.create({ data: { clerkId: OWNER, email: "grant@example.com", plan: "TRIAL" } });
}

async function seedPayment(txRef: string) {
  await prisma.payment.create({
    data: {
      ownerClerkId: OWNER,
      txRef,
      plan: "month",
      amount: "20.0000",
      currency: "USD",
      status: "pending",
    },
  });
}

describe.runIf(RUN)("grantProTermFromPayment", () => {
  it("grants exactly once when the webhook and the poll race", async () => {
    await reset();
    const txRef = "race-1";
    await seedPayment(txRef);

    const paidAt = new Date("2026-05-01T00:00:00Z");
    const periodEndsAt = new Date("2026-06-01T00:00:00Z");

    // Ten simultaneous callers, as a provider webhook replay plus a polling
    // client hammering the status endpoint would produce.
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        grantProTermFromPayment({ txRef, ownerClerkId: OWNER, providerTxId: "prov-1", paidAt, periodEndsAt }),
      ),
    );

    expect(results.filter((result) => !result.already)).toHaveLength(1);
    expect(results.filter((result) => result.already)).toHaveLength(9);

    const user = await prisma.user.findUniqueOrThrow({ where: { clerkId: OWNER } });
    expect(user.plan).toBe("ACTIVE");
    expect(user.planExpiresAt?.toISOString()).toBe(periodEndsAt.toISOString());

    const payment = await prisma.payment.findUniqueOrThrow({ where: { txRef } });
    expect(payment.status).toBe("paid");
  });

  it("refuses to grant for a payment belonging to another account", async () => {
    await reset();
    await seedPayment("owned-by-other");

    await expect(
      grantProTermFromPayment({
        txRef: "owned-by-other",
        ownerClerkId: "somebody-else",
        providerTxId: "prov-2",
        paidAt: new Date(),
        periodEndsAt: new Date(),
      }),
    ).rejects.toMatchObject({ code: "PAYMENT_OWNER_MISMATCH" });
  });

  it("reports already-paid without extending the term again", async () => {
    await reset();
    const txRef = "settled";
    await seedPayment(txRef);

    const first = new Date("2026-05-01T00:00:00Z");
    const firstEnd = new Date("2026-06-01T00:00:00Z");
    await grantProTermFromPayment({ txRef, ownerClerkId: OWNER, providerTxId: "p", paidAt: first, periodEndsAt: firstEnd });

    // A later replay must not push the expiry out.
    const later = new Date("2026-07-01T00:00:00Z");
    const laterEnd = new Date("2026-08-01T00:00:00Z");
    const replay = await grantProTermFromPayment({
      txRef,
      ownerClerkId: OWNER,
      providerTxId: "p",
      paidAt: later,
      periodEndsAt: laterEnd,
    });

    expect(replay.already).toBe(true);
    expect(replay.periodEndsAt?.toISOString()).toBe(firstEnd.toISOString());
    const user = await prisma.user.findUniqueOrThrow({ where: { clerkId: OWNER } });
    expect(user.planExpiresAt?.toISOString()).toBe(firstEnd.toISOString());
  });

  it("throws PAYMENT_NOT_FOUND for an unknown reference", async () => {
    await reset();
    await expect(
      grantProTermFromPayment({
        txRef: "does-not-exist",
        ownerClerkId: OWNER,
        providerTxId: "p",
        paidAt: new Date(),
        periodEndsAt: new Date(),
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("cleans up", async () => {
    await prisma.payment.deleteMany({ where: { ownerClerkId: OWNER } });
    await prisma.user.deleteMany({ where: { clerkId: OWNER } });
    await prisma.$disconnect();
  });
});