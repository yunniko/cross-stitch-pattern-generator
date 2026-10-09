-- G-129 M4 (D389): a consent records the early-start request made, apart from the withdrawal information shown.
-- AlterTable
ALTER TABLE "PurchaseConsent" ADD COLUMN "earlyStartVersionId" TEXT;

-- Before M4 the one text beside the box was the "withdrawal" kind, so it is what an older consent's request was.
UPDATE "PurchaseConsent" SET "earlyStartVersionId" = "withdrawalVersionId";

ALTER TABLE "PurchaseConsent" ALTER COLUMN "earlyStartVersionId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "PurchaseConsent" ADD CONSTRAINT "PurchaseConsent_earlyStartVersionId_fkey" FOREIGN KEY ("earlyStartVersionId") REFERENCES "LegalVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;