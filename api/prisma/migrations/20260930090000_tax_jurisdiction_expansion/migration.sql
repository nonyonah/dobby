-- "TaxCountry" was created by 20260921225447_add_tax_profiles with just
-- NIGERIA and US, so the new jurisdictions are added as enum values rather than
-- by re-creating the type. ADD VALUE cannot be used in the same transaction that
-- consumes the new value, and nothing here consumes them.
ALTER TYPE "TaxCountry" ADD VALUE 'UK';
ALTER TYPE "TaxCountry" ADD VALUE 'CANADA';
ALTER TYPE "TaxCountry" ADD VALUE 'KENYA';
ALTER TYPE "TaxCountry" ADD VALUE 'SOUTH_AFRICA';

-- CreateEnum
CREATE TYPE "IncomeSource" AS ENUM ('EMPLOYMENT', 'SELF_EMPLOYMENT', 'INVESTMENT', 'RENTAL', 'OTHER');

-- AlterTable
ALTER TABLE "TaxProfile" ADD COLUMN     "residencyStatus" TEXT,
ADD COLUMN     "region" TEXT,
ADD COLUMN     "ageBand" TEXT;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "incomeSource" "IncomeSource";
