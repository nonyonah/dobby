-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bachsCustomerId" TEXT,
ADD COLUMN     "bachsSubscriptionId" TEXT,
ADD COLUMN     "bachsSubscriptionStatus" TEXT,
ADD COLUMN     "bachsCurrentPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "bachsCancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "User_bachsCustomerId_key" ON "User"("bachsCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "User_bachsSubscriptionId_key" ON "User"("bachsSubscriptionId");
