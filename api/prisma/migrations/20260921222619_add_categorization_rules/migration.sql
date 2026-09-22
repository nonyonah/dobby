-- CreateTable
CREATE TABLE "CategorizationRule" (
    "id" TEXT NOT NULL,
    "ownerClerkId" TEXT NOT NULL,
    "matcher" TEXT NOT NULL,
    "categoryId" TEXT,
    "isTaxable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategorizationRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CategorizationRule_ownerClerkId_categoryId_idx" ON "CategorizationRule"("ownerClerkId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "CategorizationRule_ownerClerkId_matcher_key" ON "CategorizationRule"("ownerClerkId", "matcher");

-- AddForeignKey
ALTER TABLE "CategorizationRule" ADD CONSTRAINT "CategorizationRule_ownerClerkId_fkey" FOREIGN KEY ("ownerClerkId") REFERENCES "User"("clerkId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategorizationRule" ADD CONSTRAINT "CategorizationRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
