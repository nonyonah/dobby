-- Sub-account sections, statement checksum, transfer pairing and derived taxability.
--
-- Every column here exists because a real OPay statement proved the old model
-- could not represent it: one PDF held a Wallet section and a Savings section,
-- both rows landed in one flat queue with no account, the reference number that
-- pairs the two legs of a transfer was never read, and nothing ever checked the
-- parsed rows against the statement's own totals.

-- 1. Sub-account / statement section ------------------------------------------
-- A statement can carry several account sections. The section label travels on
-- the review item and, once approved, on the transaction, so a row always knows
-- which pocket of the same bank it came from.
ALTER TABLE "TransactionImport" ADD COLUMN "sectionSummary" JSONB;
ALTER TABLE "TransactionReviewItem" ADD COLUMN "subAccount" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "subAccount" TEXT;

-- 2. Bank transaction reference ----------------------------------------------
-- The join key for transfer detection. TEXT, not a number: four of seventeen
-- rows in the OPay sample begin with "0", and a numeric parse drops them, which
-- silently breaks pairing on exactly the rows that need it.
ALTER TABLE "TransactionReviewItem" ADD COLUMN "reference" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "reference" TEXT;
CREATE INDEX "Transaction_ownerClerkId_reference_key"
  ON "Transaction"("ownerClerkId", "reference")
  WHERE "reference" IS NOT NULL;

-- 3. Provenance of the transfer verdict ---------------------------------------
-- Auto-detected rows are a suggestion the user may disagree with, so the reason
-- is kept and the row stays overridable.
ALTER TABLE "Transaction" ADD COLUMN "transferSource" TEXT;

-- 4. Derived taxability -------------------------------------------------------
-- `isTaxable` becomes nullable because "we do not know" is now a real answer:
-- only INCOME carries a value, EXPENSE and TRANSFER are null by definition, and
-- an ambiguous inflow is null until the user answers. `taxableSource` records
-- whether that answer came from the country's tax module or from the user.
ALTER TABLE "Transaction" ALTER COLUMN "isTaxable" DROP DEFAULT;
ALTER TABLE "Transaction" ALTER COLUMN "isTaxable" DROP NOT NULL;
ALTER TABLE "Transaction" ADD COLUMN "taxableSource" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "taxTreatment" TEXT;

-- Existing rows were written under the old model, where a non-nullable false
-- meant "not deductible". Only INCOME rows ever carried meaning, so anything
-- else is cleared to NULL rather than leaving a false that reads as a decision.
UPDATE "Transaction" SET "isTaxable" = NULL WHERE "type" <> 'INCOME';

-- 5. User edits must survive automation ----------------------------------------
-- Rules re-apply walked the whole ledger and overwrote categoryId and isTaxable
-- with no way to tell a user's decision from a guess. Any row the user has
-- touched is now excluded from every automated pass.
ALTER TABLE "Transaction" ADD COLUMN "userOverridden" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Transaction_ownerClerkId_userOverridden_key"
  ON "Transaction"("ownerClerkId", "userOverridden");

-- 6. Statement checksum --------------------------------------------------------
-- Result of reconciling parsed rows against the statement's own summary, per
-- section. A section that does not reconcile must not import silently.
ALTER TABLE "TransactionImport" ADD COLUMN "checks" JSONB;
-- Which way a transfer went. Type alone cannot carry the sign: both legs of one
-- movement are TRANSFER, so net worth saw two outflows where there is one.
CREATE TYPE "TransferDirection" AS ENUM ('IN', 'OUT');

ALTER TABLE "Transaction"
  ADD COLUMN "transferDirection" "TransferDirection";

ALTER TABLE "TransactionReviewItem"
  ADD COLUMN "transferDirection" "TransferDirection";

CREATE INDEX "Transaction_ownerClerkId_transferDirection_idx"
  ON "Transaction"("ownerClerkId", "transferDirection");
