-- Backfill the trial window for accounts that predate it.
--
-- The previous migration carried `plan_status` across so nobody would be
-- downgraded by the change, but left `trial_ends_at` null for everyone who had
-- already started a trial. `getEntitlement` reads the window, not the status,
-- so those accounts would have computed as free the moment this shipped and
-- lost access they had already been given.
--
-- The end is derived from the start plus the same seven days the API grants, so
-- an account that started on day one keeps its remaining six rather than being
-- handed a fresh week. Rows with no start are left null: they never started one.
UPDATE "User"
SET "trial_ends_at" = "trialStartedAt" + INTERVAL '7 days'
WHERE "trialStartedAt" IS NOT NULL
  AND "trial_ends_at" IS NULL;

-- Anyone left in `trial` with no window has nothing to be a trial against, so
-- they are free. This is a correction, not a downgrade: they had no window to
-- lose, and the old status was the Bachs subscription's, not a window of ours.
UPDATE "User"
SET "plan_status" = 'free'
WHERE "plan_status" = 'trial'
  AND "trial_ends_at" IS NULL;