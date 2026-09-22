-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "TransactionReviewItem" (
    "id" TEXT NOT NULL,
    "ownerClerkId" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "rawData" JSONB NOT NULL,
    "proposedData" JSONB,
    "fingerprint" TEXT,
    "confidence" DECIMAL(5,4),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransactionReviewItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransactionReviewItem_ownerClerkId_status_createdAt_idx" ON "TransactionReviewItem"("ownerClerkId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionReviewItem_importId_rowNumber_key" ON "TransactionReviewItem"("importId", "rowNumber");

-- AddForeignKey
ALTER TABLE "TransactionReviewItem" ADD CONSTRAINT "TransactionReviewItem_ownerClerkId_fkey" FOREIGN KEY ("ownerClerkId") REFERENCES "User"("clerkId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionReviewItem" ADD CONSTRAINT "TransactionReviewItem_importId_fkey" FOREIGN KEY ("importId") REFERENCES "TransactionImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
