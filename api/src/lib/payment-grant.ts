import { Plan, Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { AppError } from "../middleware/errors.js";

export type GrantTermResult = { granted: true; already: boolean; periodEndsAt: Date | null };

/**
 * Mark a pending Payment paid and extend Pro once. Concurrent webhook + poll
 * callers race on the same txRef; only one `pending` → `paid` transition wins.
 */
export async function grantProTermFromPayment(input: {
  txRef: string;
  ownerClerkId: string;
  providerTxId: string;
  paidAt: Date;
  periodEndsAt: Date;
  assertAmount?: (payment: { plan: string; amount: Prisma.Decimal; currency: string }) => void;
}): Promise<GrantTermResult> {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { txRef: input.txRef } });
    if (!payment) throw new AppError(404, "No matching payment request.", "PAYMENT_NOT_FOUND");
    if (payment.ownerClerkId !== input.ownerClerkId) {
      throw new AppError(403, "This payment belongs to a different account.", "PAYMENT_OWNER_MISMATCH");
    }
    if (payment.status === "paid") {
      return { granted: true, already: true, periodEndsAt: payment.periodEndsAt };
    }
    input.assertAmount?.(payment);

    const claimed = await tx.payment.updateMany({
      where: { txRef: input.txRef, status: "pending" },
      data: {
        status: "paid",
        providerTxId: input.providerTxId,
        paidAt: input.paidAt,
        periodEndsAt: input.periodEndsAt,
      },
    });
    if (claimed.count === 0) {
      const again = await tx.payment.findUnique({ where: { txRef: input.txRef } });
      if (again?.status === "paid") {
        return { granted: true, already: true, periodEndsAt: again.periodEndsAt };
      }
      throw new AppError(409, "Payment could not be fulfilled.", "PAYMENT_FULFILL_CONFLICT");
    }

    await tx.user.update({
      where: { clerkId: input.ownerClerkId },
      data: { plan: Plan.ACTIVE, planExpiresAt: input.periodEndsAt },
    });
    return { granted: true, already: false, periodEndsAt: input.periodEndsAt };
  });
}
