-- Renamespaced Plan: FREE/PRO -> TRIAL/ACTIVE/EXPIRED (14-day free trial replaces the old Free tier).

-- Drop the old default before the type swap so it cannot reference a dropped enum.
ALTER TABLE "User" ALTER COLUMN "plan" DROP DEFAULT;

ALTER TYPE "Plan" RENAME TO "Plan_old";

CREATE TYPE "Plan" AS ENUM ('TRIAL', 'ACTIVE', 'EXPIRED');

ALTER TABLE "User" ADD COLUMN "trialStartedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "User" ALTER COLUMN "plan" TYPE "Plan" USING (
  CASE "plan"::text
    WHEN 'PRO' THEN 'ACTIVE'
    ELSE 'TRIAL'
  END::"Plan"
);

ALTER TABLE "User" ALTER COLUMN "plan" SET DEFAULT 'TRIAL';

-- Existing rows: everyone without a paid subscription starts (or keeps) a trial clock now.
UPDATE "User" SET "trialStartedAt" = CURRENT_TIMESTAMP;

DROP TYPE "Plan_old";
