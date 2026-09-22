-- CreateEnum
CREATE TYPE "BudgetType" AS ENUM ('FIXED', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "ownerClerkId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "type" "BudgetType" NOT NULL,
    "value" DECIMAL(19,4) NOT NULL,
    "isExcluded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "ownerClerkId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetAmount" DECIMAL(19,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "deadline" TIMESTAMP(3),
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalContribution" (
    "id" TEXT NOT NULL,
    "ownerClerkId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "contributedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoalContribution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Budget_ownerClerkId_isExcluded_idx" ON "Budget"("ownerClerkId", "isExcluded");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_ownerClerkId_categoryId_key" ON "Budget"("ownerClerkId", "categoryId");

-- CreateIndex
CREATE INDEX "Goal_ownerClerkId_status_deadline_idx" ON "Goal"("ownerClerkId", "status", "deadline");

-- CreateIndex
CREATE INDEX "GoalContribution_ownerClerkId_goalId_contributedAt_idx" ON "GoalContribution"("ownerClerkId", "goalId", "contributedAt");

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_ownerClerkId_fkey" FOREIGN KEY ("ownerClerkId") REFERENCES "User"("clerkId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_ownerClerkId_fkey" FOREIGN KEY ("ownerClerkId") REFERENCES "User"("clerkId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalContribution" ADD CONSTRAINT "GoalContribution_ownerClerkId_fkey" FOREIGN KEY ("ownerClerkId") REFERENCES "User"("clerkId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalContribution" ADD CONSTRAINT "GoalContribution_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
