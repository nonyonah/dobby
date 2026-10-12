-- Drop the saved-card renewal columns.
--
-- They were added for a checkout that asked to keep the card and re-charged it
-- each period. Measured on this account, `save_payment_method: true` is exactly
-- what removes bank transfer and crypto from the page, because a checkout that
-- keeps a payment method can only offer methods that can be saved. So auto-renew
-- and the other rails are mutually exclusive on Bachs, and the rails won:
-- customers who want them start a new checkout when a term ends.
--
-- Nothing was ever written to these columns — no card has been saved — so
-- dropping them loses no data and leaves the accounts that were live on a Bachs
-- subscription untouched.

ALTER TABLE "User" DROP COLUMN IF EXISTS "bachsPaymentMethodId";
ALTER TABLE "User" DROP COLUMN IF EXISTS "bachsRecurring";
ALTER TABLE "User" DROP COLUMN IF EXISTS "bachsNextChargeAt";
ALTER TABLE "User" DROP COLUMN IF EXISTS "bachsChargeCurrency";
ALTER TABLE "User" DROP COLUMN IF EXISTS "bachsChargeInterval";
ALTER TABLE "User" DROP COLUMN IF EXISTS "bachsChargeAmount";

DROP INDEX IF EXISTS "User_bachsNextChargeAt_idx";
