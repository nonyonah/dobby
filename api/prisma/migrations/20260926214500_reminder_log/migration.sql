-- One row per reminder email actually sent (filing-deadline marks + monthly digests).
CREATE TABLE "ReminderLog" (
  "id" TEXT NOT NULL,
  "ownerClerkId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "taxYear" INTEGER NOT NULL,
  "daysBefore" INTEGER NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReminderLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReminderLog_ownerClerkId_kind_taxYear_daysBefore_key" ON "ReminderLog"("ownerClerkId", "kind", "taxYear", "daysBefore");
CREATE INDEX "ReminderLog_ownerClerkId_kind_idx" ON "ReminderLog"("ownerClerkId", "kind");

ALTER TABLE "ReminderLog" ADD CONSTRAINT "ReminderLog_ownerClerkId_fkey" FOREIGN KEY ("ownerClerkId") REFERENCES "User"("clerkId") ON DELETE CASCADE ON UPDATE CASCADE;
