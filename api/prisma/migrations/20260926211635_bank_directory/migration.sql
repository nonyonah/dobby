-- CreateTable
CREATE TABLE "Bank" (
    "id" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "code" TEXT,
    "longcode" TEXT,
    "cert" TEXT,
    "city" TEXT,
    "state" TEXT,
    "website" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankSenderRule" (
    "id" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,
    "matchType" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankSenderRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantRule" (
    "id" TEXT NOT NULL,
    "merchant" TEXT NOT NULL,
    "category" TEXT,
    "matchType" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Bank_country_name_idx" ON "Bank"("country", "name");

-- CreateIndex
CREATE INDEX "Bank_country_code_idx" ON "Bank"("country", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Bank_source_sourceId_key" ON "Bank"("source", "sourceId");

-- CreateIndex
CREATE INDEX "BankSenderRule_matchType_pattern_idx" ON "BankSenderRule"("matchType", "pattern");

-- CreateIndex
CREATE UNIQUE INDEX "BankSenderRule_bankId_matchType_pattern_key" ON "BankSenderRule"("bankId", "matchType", "pattern");

-- CreateIndex
CREATE INDEX "MerchantRule_matchType_pattern_idx" ON "MerchantRule"("matchType", "pattern");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantRule_merchant_matchType_pattern_key" ON "MerchantRule"("merchant", "matchType", "pattern");

-- AddForeignKey
ALTER TABLE "BankSenderRule" ADD CONSTRAINT "BankSenderRule_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE CASCADE ON UPDATE CASCADE;
