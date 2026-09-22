-- CreateEnum
CREATE TYPE "TaxCountry" AS ENUM ('NIGERIA', 'US');

-- CreateEnum
CREATE TYPE "TaxChecklistStatus" AS ENUM ('READY', 'OUTSTANDING');

-- CreateTable
CREATE TABLE "TaxProfile" (
    "id" TEXT NOT NULL,
    "ownerClerkId" TEXT NOT NULL,
    "country" "TaxCountry" NOT NULL DEFAULT 'NIGERIA',
    "taxYear" INTEGER NOT NULL,
    "estimatedTaxOwed" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "taxableIncome" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "deductionsCaptured" JSONB,
    "lastCalculatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxChecklistItem" (
    "id" TEXT NOT NULL,
    "taxProfileId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "TaxChecklistStatus" NOT NULL DEFAULT 'OUTSTANDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaxProfile_ownerClerkId_key" ON "TaxProfile"("ownerClerkId");

-- CreateIndex
CREATE INDEX "TaxChecklistItem_taxProfileId_status_idx" ON "TaxChecklistItem"("taxProfileId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TaxChecklistItem_taxProfileId_key_key" ON "TaxChecklistItem"("taxProfileId", "key");

-- AddForeignKey
ALTER TABLE "TaxProfile" ADD CONSTRAINT "TaxProfile_ownerClerkId_fkey" FOREIGN KEY ("ownerClerkId") REFERENCES "User"("clerkId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxChecklistItem" ADD CONSTRAINT "TaxChecklistItem_taxProfileId_fkey" FOREIGN KEY ("taxProfileId") REFERENCES "TaxProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
