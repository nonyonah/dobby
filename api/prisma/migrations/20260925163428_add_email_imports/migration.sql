-- CreateTable
CREATE TABLE "EmailSyncJob" (
    "id" TEXT NOT NULL,
    "ownerClerkId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "scanned" INTEGER NOT NULL DEFAULT 0,
    "imported" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailImport" (
    "id" TEXT NOT NULL,
    "ownerClerkId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "subject" TEXT,
    "fromAddress" TEXT,
    "receivedAt" TIMESTAMP(3),
    "kind" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL,
    "detail" TEXT,
    "importId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailSyncJob_ownerClerkId_createdAt_idx" ON "EmailSyncJob"("ownerClerkId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailImport_ownerClerkId_createdAt_idx" ON "EmailImport"("ownerClerkId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailImport_ownerClerkId_contentHash_idx" ON "EmailImport"("ownerClerkId", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "EmailImport_ownerClerkId_provider_messageId_key" ON "EmailImport"("ownerClerkId", "provider", "messageId");

-- AddForeignKey
ALTER TABLE "EmailSyncJob" ADD CONSTRAINT "EmailSyncJob_ownerClerkId_fkey" FOREIGN KEY ("ownerClerkId") REFERENCES "User"("clerkId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailImport" ADD CONSTRAINT "EmailImport_ownerClerkId_fkey" FOREIGN KEY ("ownerClerkId") REFERENCES "User"("clerkId") ON DELETE CASCADE ON UPDATE CASCADE;
