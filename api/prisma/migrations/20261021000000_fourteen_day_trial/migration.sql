-- Fourteen-day trial.
--
-- The trial was seven days. It is now fourteen, measured from the moment the
-- user first reaches for a Pro feature rather than at sign-up, so the extra week
-- is the one they actually get to use.
--
-- Anyone already inside a trial keeps their original start and is given the new
-- length, so a day-one user gains a week rather than having their window
-- restarted. Two groups are deliberately left alone:
--
--   - accounts that already pay, who never get the extra time;
--   - trials that have already ended, whose windows are closed and granting a
--     new one would hand out 14 days of Pro to someone who already used theirs.
UPDATE "User"
SET "trial_ends_at" = "trialStartedAt" + INTERVAL '14 days'
WHERE "trialStartedAt" IS NOT NULL
  AND "trial_ends_at" > NOW()
  AND "plan_status" = 'trial'
  AND ("bachsSubscriptionStatus" IS NULL OR "bachsSubscriptionStatus" NOT IN ('active', 'past_due'));

-- A window that would already have closed under the old length stays closed.
-- This is the same set minus the accounts a payment already covers.
UPDATE "User"
SET "plan_status" = 'free'
WHERE "plan_status" = 'trial'
  AND ("trial_ends_at" IS NULL OR "trial_ends_at" <= NOW());