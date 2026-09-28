-- One-time Pro term end (Flutterwave NGN purchases).
ALTER TABLE "User" ADD COLUMN "planExpiresAt" TIMESTAMP(3);

-- One-time Pro term purchases (Flutterwave NGN).
CREATE TABLE "Payment" (
  "id" TEXT NOT NULL,
  "ownerClerkId" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'flutterwave',
  "txRef" TEXT NOT NULL,
  "providerTxId" TEXT,
  "plan" TEXT NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'NGN',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "paidAt" TIMESTAMP(3),
  "periodEndsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Payment_txRef_key" ON "Payment"("txRef");
CREATE INDEX "Payment_ownerClerkId_status_idx" ON "Payment"("ownerClerkId", "status");

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_ownerClerkId_fkey" FOREIGN KEY ("ownerClerkId") REFERENCES "User"("clerkId") ON DELETE CASCADE ON UPDATE CASCADE;
