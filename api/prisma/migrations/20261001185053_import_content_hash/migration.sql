-- Recognise a statement that has already been imported, by the hash of its
-- bytes. Re-uploading the same statement used to create a second import and
-- pay for a second extraction.
ALTER TABLE "TransactionImport" ADD COLUMN "contentHash" TEXT;

CREATE INDEX "TransactionImport_ownerClerkId_contentHash_idx"
  ON "TransactionImport"("ownerClerkId", "contentHash");
