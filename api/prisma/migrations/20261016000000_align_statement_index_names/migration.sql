-- Reconcile two index names with what Prisma expects.
--
-- The statement migration created these by hand and suffixed them `_key`, which
-- is the convention for a unique constraint, not for an index. Nothing reads
-- the name directly, but `prisma migrate diff` reads the *difference* between
-- the database and the schema, so every deploy reported them as drift and
-- wanted to drop and recreate indexes that were already correct in substance.
ALTER INDEX "Transaction_ownerClerkId_reference_key"
  RENAME TO "Transaction_ownerClerkId_reference_idx";

ALTER INDEX "Transaction_ownerClerkId_userOverridden_key"
  RENAME TO "Transaction_ownerClerkId_userOverridden_idx";
