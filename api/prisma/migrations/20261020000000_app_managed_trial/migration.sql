-- App-managed trial.
--
-- The free trial used to be Bachs' `trial` on the product: every checkout billed
-- $0.00 for seven days and then converted, which meant the trial lived in
-- someone else's product record and a signed-up user had a live subscription
-- before they had ever paid. It is now started deliberately, by the user, with
-- no card and no checkout.
--
-- `trial_ends_at` is stored rather than derived from `trial_started_at` plus a
-- constant, so changing the length later cannot silently move a window somebody
-- is already inside.

ALTER TABLE "User" ADD COLUMN "trial_ends_at" TIMESTAMP(3);

-- One status column, widened to the states the app actually distinguishes. The
-- old TRIAL/ACTIVE/EXPIRED triple could not say "canceled" or "past_due", so a
-- cancel and a failed renewal both had to be guessed at from other columns.
--
-- Values are carried across rather than reset, so nobody loses access during the
-- change: ACTIVE means money in, TRIAL means the old window is still running,
-- EXPIRED becomes free.
CREATE TYPE "PlanStatus" AS ENUM ('free', 'trial', 'pro', 'past_due', 'canceled');

ALTER TABLE "User"
  ADD COLUMN "plan_status" "PlanStatus";

UPDATE "User"
SET "plan_status" = CASE
  WHEN "plan" = 'ACTIVE' THEN 'pro'::"PlanStatus"
  WHEN "plan" = 'TRIAL' THEN 'trial'::"PlanStatus"
  ELSE 'free'::"PlanStatus"
END;

ALTER TABLE "User" ALTER COLUMN "plan_status" SET DEFAULT 'free';
ALTER TABLE "User" ALTER COLUMN "plan_status" SET NOT NULL;

DROP INDEX "User_plan_idx";

ALTER TABLE "User" DROP COLUMN "plan";

DROP TYPE "Plan";

CREATE INDEX "User_plan_status_idx" ON "User"("plan_status");

-- Entitlement is now read on every request that touches a paid surface, and the
-- trial window is the cheapest possible query on it.
CREATE INDEX "User_trial_ends_at_idx" ON "User"("trial_ends_at");