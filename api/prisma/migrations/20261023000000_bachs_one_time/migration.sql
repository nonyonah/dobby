-- Bachs one-time (bank transfer / crypto) purchases.
--
-- Extends the Flutterwave-shaped `Payment` table rather than replacing it, so
-- the existing history and its `txRef` idempotency key are untouched. A Bachs
-- purchase is `provider = 'bachs'` with the charge id in `providerTxId`.
--
-- The composite unique on (provider, providerTxId) is what stops a replayed
-- `collection.succeeded` granting a second month of Pro. Postgres lets many
-- NULLs through a unique index, so the historical rows with no providerTxId are
-- unaffected by adding it.

-- How many months a purchase bought, so applying access is arithmetic rather
-- than a branch on which button was pressed.
ALTER TABLE "Payment" ADD COLUMN "months" INTEGER NOT NULL DEFAULT 1;

-- The checkout session an order was opened from. `collection.underpaid` and
-- `checkout.completed` both carry `checkout_id`, and `reference` is absent on
-- some deliveries, so without this a matching event would find no order and
-- grant nothing.
ALTER TABLE "Payment" ADD COLUMN "checkoutId" TEXT;

CREATE INDEX "Payment_checkoutId_idx" ON "Payment"("checkoutId");

-- How far short a crypto payment landed, in the payment's own currency. Set on
-- `underpaid`, which grants nothing: it is here so the Plan page can state what
-- is still owed without re-deriving it from the original charge.
ALTER TABLE "Payment" ADD COLUMN "shortfall" DECIMAL(19,4);

-- The renewal nudges read every one-time payer by the date their access ends.
-- Without this the "ends in 7 days" sweep is a sequential scan of every payment
-- ever taken.
CREATE INDEX "Payment_periodEndsAt_idx" ON "Payment"("periodEndsAt");

-- One row per charge, per provider. The guard against a duplicate webhook.
CREATE UNIQUE INDEX "Payment_provider_providerTxId_key" ON "Payment"("provider", "providerTxId");

-- Webhook idempotency. `eventId` is unique, so an insert-or-ignore is enough to
-- make a redelivery a no-op: `collection.succeeded` and `checkout.completed`
-- describe the same single payment and either can arrive first.
CREATE TABLE "WebhookEvent" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),

  CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WebhookEvent_eventId_key" ON "WebhookEvent"("eventId");