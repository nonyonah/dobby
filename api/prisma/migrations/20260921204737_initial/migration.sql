-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('BANK', 'CASH', 'CREDIT_CARD', 'WALLET', 'INVESTMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "Chain" AS ENUM ('BASE', 'SOLANA');

-- CreateEnum
CREATE TYPE "WalletValidationStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER');

-- CreateEnum
CREATE TYPE "ImportType" AS ENUM ('CSV', 'OFX', 'QFX', 'RECEIPT');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('CREATED', 'PROCESSING', 'REVIEW', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "clerkId" TEXT NOT NULL,
    "email" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("clerkId")
);

-- CreateTable
CREATE TABLE "Profile" (
    "clerkId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "country" TEXT,
    "taxJurisdiction" TEXT,
    "theme" TEXT,
    "accentColor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("clerkId")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "ownerClerkId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "institution" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletAccount" (
    "id" TEXT NOT NULL,
    "ownerClerkId" TEXT NOT NULL,
    "chain" "Chain" NOT NULL,
    "address" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "validationStatus" "WalletValidationStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "ownerClerkId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "isTaxable" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "ownerClerkId" TEXT NOT NULL,
    "accountId" TEXT,
    "categoryId" TEXT,
    "type" "TransactionType" NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "description" TEXT NOT NULL,
    "merchant" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT,
    "externalId" TEXT,
    "fingerprint" TEXT,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "isTaxable" BOOLEAN NOT NULL DEFAULT false,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "importId" TEXT,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionImport" (
    "id" TEXT NOT NULL,
    "ownerClerkId" TEXT NOT NULL,
    "type" "ImportType" NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'CREATED',
    "objectKey" TEXT,
    "originalName" TEXT,
    "rowCount" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransactionImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationConnection" (
    "id" TEXT NOT NULL,
    "ownerClerkId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "providerUserId" TEXT,
    "metadata" JSONB,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "ownerClerkId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "requestId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Account_ownerClerkId_isActive_idx" ON "Account"("ownerClerkId", "isActive");

-- CreateIndex
CREATE INDEX "WalletAccount_ownerClerkId_isActive_idx" ON "WalletAccount"("ownerClerkId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "WalletAccount_ownerClerkId_chain_address_key" ON "WalletAccount"("ownerClerkId", "chain", "address");

-- CreateIndex
CREATE INDEX "Category_ownerClerkId_isArchived_idx" ON "Category"("ownerClerkId", "isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "Category_ownerClerkId_name_key" ON "Category"("ownerClerkId", "name");

-- CreateIndex
CREATE INDEX "Transaction_ownerClerkId_occurredAt_idx" ON "Transaction"("ownerClerkId", "occurredAt");

-- CreateIndex
CREATE INDEX "Transaction_ownerClerkId_categoryId_occurredAt_idx" ON "Transaction"("ownerClerkId", "categoryId", "occurredAt");

-- CreateIndex
CREATE INDEX "Transaction_ownerClerkId_fingerprint_idx" ON "Transaction"("ownerClerkId", "fingerprint");

-- CreateIndex
CREATE INDEX "TransactionImport_ownerClerkId_status_createdAt_idx" ON "TransactionImport"("ownerClerkId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConnection_ownerClerkId_provider_key" ON "IntegrationConnection"("ownerClerkId", "provider");

-- CreateIndex
CREATE INDEX "AuditEvent_ownerClerkId_createdAt_idx" ON "AuditEvent"("ownerClerkId", "createdAt");

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_clerkId_fkey" FOREIGN KEY ("clerkId") REFERENCES "User"("clerkId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_ownerClerkId_fkey" FOREIGN KEY ("ownerClerkId") REFERENCES "User"("clerkId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletAccount" ADD CONSTRAINT "WalletAccount_ownerClerkId_fkey" FOREIGN KEY ("ownerClerkId") REFERENCES "User"("clerkId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_ownerClerkId_fkey" FOREIGN KEY ("ownerClerkId") REFERENCES "User"("clerkId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_ownerClerkId_fkey" FOREIGN KEY ("ownerClerkId") REFERENCES "User"("clerkId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_importId_fkey" FOREIGN KEY ("importId") REFERENCES "TransactionImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionImport" ADD CONSTRAINT "TransactionImport_ownerClerkId_fkey" FOREIGN KEY ("ownerClerkId") REFERENCES "User"("clerkId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_ownerClerkId_fkey" FOREIGN KEY ("ownerClerkId") REFERENCES "User"("clerkId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_ownerClerkId_fkey" FOREIGN KEY ("ownerClerkId") REFERENCES "User"("clerkId") ON DELETE CASCADE ON UPDATE CASCADE;
