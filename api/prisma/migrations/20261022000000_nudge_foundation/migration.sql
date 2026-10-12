-- Nudge foundation.
--
-- Three additions, all of them state the nudge rules are read against rather
-- than decisions the rules make:
--
--   * `last_active_at` — every "is this person still around" question. Measuring
--     it from the newest transaction cannot tell a dormant account from one that
--     has been reading and not acting, and it sends the wrong email to the
--     wrong person.
--   * `timezone` — the send window and "the 2nd of the month" are both stated in
--     the user's own day, not UTC. A 09:00 send is the middle of the night
--     somewhere, and the reverse is worse.
--   * `nudge_log` — the whole life of every nudge, and the idempotency record.
--
-- Preferences default to on. A product that starts silent about what it sends is
-- worse than one that has to be turned off deliberately.

ALTER TABLE "User" ADD COLUMN "last_active_at" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "timezone" TEXT DEFAULT 'Africa/Lagos';
ALTER TABLE "User" ADD COLUMN "nudge_emails_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "nudge_in_app_enabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "NudgeLog" (
  "id" TEXT NOT NULL,
  "ownerClerkId" TEXT NOT NULL,
  "nudgeKey" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "clickedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "dismissedAt" TIMESTAMP(3),
  "shownAt" TIMESTAMP(3),

  CONSTRAINT "NudgeLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NudgeLog_ownerClerkId_nudgeKey_channel_idx" ON "NudgeLog"("ownerClerkId", "nudgeKey", "channel");
CREATE INDEX "NudgeLog_ownerClerkId_sentAt_idx" ON "NudgeLog"("ownerClerkId", "sentAt");
CREATE INDEX "NudgeLog_nudgeKey_sentAt_idx" ON "NudgeLog"("nudgeKey", "sentAt");

ALTER TABLE "NudgeLog"
  ADD CONSTRAINT "NudgeLog_ownerClerkId_fkey"
  FOREIGN KEY ("ownerClerkId") REFERENCES "User"("clerkId") ON DELETE CASCADE ON UPDATE CASCADE;

-- The sweep reads "dormant for N days" and "not opted out" on every run, and
-- last_active_at is the column both are measured from.
CREATE INDEX "User_last_active_at_idx" ON "User"("last_active_at");
CREATE INDEX "User_nudge_emails_enabled_idx" ON "User"("nudge_emails_enabled");
CREATE INDEX "User_nudge_in_app_enabled_idx" ON "User"("nudge_in_app_enabled");