-- Stablecoin cash-out, on-ramp and yield events.
--
-- Two lessons are baked into this migration.
--
-- First, `KnownEntity.address` and `UserEntity.address` are seeded empty on
-- purpose. Matching a transfer against the wrong address would label someone
-- else's payment as this user's yield or cash-out, inside a tax figure. An
-- absent address only weakens a match; a wrong one actively misstates income,
-- so the seeds ship names and narration patterns and nothing else.
--
-- Second, the two unique constraints are the idempotency guard, not a nicety.
-- Detection runs after every wallet sync, import and email sync, plus nightly,
-- so the same movement is observed many times. Without a constraint, running
-- the job twice would double every suggestion the user is asked to confirm.
--
-- `usdValue` is nullable and must stay that way: a naira-pegged token such as
-- cNGN has no meaningful USD value, and storing 0 would read as "worth nothing"
-- rather than "not applicable".

CREATE TYPE "StablecoinEventKind" AS ENUM ('CASH_OUT', 'ON_RAMP', 'YIELD_RECEIVED', 'YIELD_REDEMPTION_GAIN');
CREATE TYPE "StablecoinEventStatus" AS ENUM ('SUGGESTED', 'CONFIRMED', 'DISMISSED');

CREATE TABLE "KnownEntity" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "chain" "Chain",
  "address" TEXT,
  "narrationPatterns" TEXT[],
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KnownEntity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserEntity" (
  "id" TEXT NOT NULL,
  "ownerClerkId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "chain" "Chain",
  "address" TEXT,
  "narrationPatterns" TEXT[],
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserEntity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StablecoinEvent" (
  "id" TEXT NOT NULL,
  "ownerClerkId" TEXT NOT NULL,
  "kind" "StablecoinEventKind" NOT NULL,
  "status" "StablecoinEventStatus" NOT NULL DEFAULT 'SUGGESTED',
  "token" TEXT NOT NULL,
  "chain" "Chain",
  "tokenAmount" DECIMAL(19,4) NOT NULL,
  "usdValue" DECIMAL(19,4),
  "nairaAmount" DECIMAL(19,4),
  "impliedRate" DECIMAL(19,4),
  "feeAmount" DECIMAL(19,4),
  "stampDutyNote" BOOLEAN NOT NULL DEFAULT false,
  "onchainTxHash" TEXT,
  "linkedTransactionId" TEXT,
  "entityId" TEXT,
  "matchConfidence" DECIMAL(3,2) NOT NULL DEFAULT 0,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedAt" TIMESTAMP(3),
  CONSTRAINT "StablecoinEvent_pkey" PRIMARY KEY ("id")
);

-- One event per movement per kind. Postgres does not treat NULLs as equal, so
-- bank-only and on-chain-only events each dedupe within their own key instead
-- of colliding with one another.
CREATE UNIQUE INDEX "KnownEntity_kind_name_chain_key" ON "KnownEntity"("kind", "name", "chain");
CREATE UNIQUE INDEX "UserEntity_ownerClerkId_kind_name_key" ON "UserEntity"("ownerClerkId", "kind", "name");
CREATE UNIQUE INDEX "StablecoinEvent_ownerClerkId_onchainTxHash_kind_key" ON "StablecoinEvent"("ownerClerkId", "onchainTxHash", "kind");
CREATE UNIQUE INDEX "StablecoinEvent_ownerClerkId_linkedTransactionId_kind_key" ON "StablecoinEvent"("ownerClerkId", "linkedTransactionId", "kind");

CREATE INDEX "KnownEntity_kind_idx" ON "KnownEntity"("kind");
CREATE INDEX "UserEntity_ownerClerkId_kind_idx" ON "UserEntity"("ownerClerkId", "kind");
CREATE INDEX "StablecoinEvent_ownerClerkId_status_createdAt_idx" ON "StablecoinEvent"("ownerClerkId", "status", "createdAt");

ALTER TABLE "StablecoinEvent" ADD CONSTRAINT "StablecoinEvent_ownerClerkId_fkey"
  FOREIGN KEY ("ownerClerkId") REFERENCES "User"("clerkId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Y3's opt-in. Default false because claiming a wallet earns yield is a claim
-- about the user's finances, and most wallets never earn anything.
ALTER TABLE "WalletAccount" ADD COLUMN "earnsYield" BOOLEAN NOT NULL DEFAULT false;

-- Links a ledger row to the movement it is a leg of, so a cash-out's two legs
-- can be shown together and neither counts as income or spending.
ALTER TABLE "Transaction" ADD COLUMN "stablecoinEventId" TEXT;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_stablecoinEventId_fkey"
  FOREIGN KEY ("stablecoinEventId") REFERENCES "StablecoinEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
