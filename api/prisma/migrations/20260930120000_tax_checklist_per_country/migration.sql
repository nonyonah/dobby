-- Each jurisdiction keeps its own filing checklist, so items carry the country
-- that owns them instead of being wiped when the user switches jurisdiction.
ALTER TABLE "TaxChecklistItem" ADD COLUMN     "country" "TaxCountry";

-- Backfill existing rows to the country their TaxProfile currently holds, so a
-- profile that is mid-flight keeps its ticks rather than resetting to OUTSTANDING.
UPDATE "TaxChecklistItem" AS item
SET "country" = profile."country"
FROM "TaxProfile" AS profile
WHERE profile."id" = item."taxProfileId";

ALTER TABLE "TaxChecklistItem" ALTER COLUMN "country" SET NOT NULL;

-- Existing rows are unique per profile on `key` alone, so this holds for the
-- backfilled set and the constraint can be tightened to include the country.
DROP INDEX "TaxChecklistItem_taxProfileId_key_key";
CREATE UNIQUE INDEX "TaxChecklistItem_taxProfileId_country_key_key" ON "TaxChecklistItem"("taxProfileId", "country", "key");

DROP INDEX "TaxChecklistItem_taxProfileId_status_idx";
CREATE INDEX "TaxChecklistItem_taxProfileId_country_status_idx" ON "TaxChecklistItem"("taxProfileId", "country", "status");