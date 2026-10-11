-- Once-per-user marker for the first-import summary.
--
-- Doubles as the idempotency key: the job claims the send with a conditional
-- update on this column before it sends anything, so two sweeps racing each
-- other produce one winner and one zero-row update rather than two emails. A
-- read-then-write would not survive that.
--
-- Null for everyone who has already imported, which is what makes the first
-- sweep after a deploy find them.
ALTER TABLE "User" ADD COLUMN "firstImportSummarySentAt" TIMESTAMP(3);

-- The sweep looks up "imported, never summarised, import finished long enough
-- ago", and every run scans that set.
CREATE INDEX "User_firstImportSummarySentAt_idx" ON "User"("firstImportSummarySentAt");