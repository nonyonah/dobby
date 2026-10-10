-- Make the reference index one Prisma can represent.
--
-- It was created as a partial index over rows where `reference IS NOT NULL`,
-- which is a genuine size win while most transactions come from card feeds and
-- manual entry and carry no bank reference at all.
--
-- Prisma cannot declare a partial index in the datamodel, though, so every
-- `migrate diff` reported it as drift and every deploy wanted to add a second,
-- full index beside it. Two indexes over the same columns, one of them
-- invisible to the schema, is a trap for whoever reads this next — and the
-- saving it buys is negligible at this table size.
--
-- The trade is deliberate: a plain index the tooling fully understands, over a
-- smaller one it keeps trying to "fix". If the table ever grows to the point
-- where the partial form matters, that is the moment to model it deliberately
-- rather than leave it as an unmanaged extra.
DROP INDEX "Transaction_ownerClerkId_reference_idx";

CREATE INDEX "Transaction_ownerClerkId_reference_idx"
  ON "Transaction"("ownerClerkId", "reference");
