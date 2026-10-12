-- Saved-card renewals.
--
-- A one-time checkout can offer bank transfer and crypto, which a recurring
-- product cannot, because nothing can re-charge those off-session. The trade is
-- that a card payment has to be re-charged by us: `save_payment_method` keeps the
-- card, and this table records that we own the billing cycle for the account.
--
-- Every column here is nullable or defaulted, so existing rows are untouched and
-- existing Bachs subscribers keep being renewed by Bachs rather than being
-- charged a second time.

-- The saved card. Null for anyone who paid by bank transfer or crypto, which is
-- the normal state for those customers rather than a broken one.
ALTER TABLE "User" ADD COLUMN "bachsPaymentMethodId" TEXT;

-- Whether we bill this account ourselves from that card. Off for everyone who
-- still has a live Bachs subscription, so the two renewal paths cannot both run.
ALTER TABLE "User" ADD COLUMN "bachsRecurring" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "User" ADD COLUMN "bachsNextChargeAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "bachsChargeCurrency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "User" ADD COLUMN "bachsChargeInterval" TEXT NOT NULL DEFAULT 'month';
ALTER TABLE "User" ADD COLUMN "bachsChargeAmount" DECIMAL(19,4);

-- The renewal sweep reads "due and not already handled" on every run; without
-- this it is a sequential scan of every account.
--
-- After the column, not before. Postgres resolves the index definition when it
-- is created, so an index naming a column added later fails the whole migration
-- with `column does not exist` from ComputeIndexAttrs — which is what happened
-- the first time this ran.
CREATE INDEX "User_bachsNextChargeAt_idx" ON "User"("bachsNextChargeAt");
