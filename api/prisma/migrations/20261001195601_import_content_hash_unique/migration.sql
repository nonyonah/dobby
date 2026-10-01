-- Make a repeat import impossible rather than merely unlikely.
--
-- The application checks contentHash before extracting and skips a statement it
-- has already read, but that check and the insert are not one atomic step: two
-- syncs of the same mailbox, or a sync racing a manual upload, could both pass
-- it. Hashing the ledger showed the same file imported 30 times on this account,
-- so the ceiling has to be the database, not only the code path.
--
-- Partial on purpose:
--   * contentHash IS NOT NULL  - an import whose file could not be read has no
--     hash and must not collide with anything.
--   * status <> 'FAILED'       - a FAILED import is deliberately re-runnable. The
--     usual reason it failed was a locked PDF or a provider error, and a unique
--     index over all statuses would make the retry impossible.
--
-- Rows that duplicated before this index existed had their contentHash released
-- onto the earliest surviving copy of each file, so this applies cleanly.
CREATE UNIQUE INDEX "TransactionImport_ownerClerkId_contentHash_key"
  ON "TransactionImport"("ownerClerkId", "contentHash")
  WHERE "contentHash" IS NOT NULL AND "status" <> 'FAILED';
