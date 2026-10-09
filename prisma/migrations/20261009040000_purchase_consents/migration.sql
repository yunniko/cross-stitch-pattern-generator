-- G-128 M2 (D384): a buyer's consent before Checkout.
-- CreateTable
CREATE TABLE "PurchaseConsent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "priceId" TEXT NOT NULL,
    "termsVersionId" TEXT NOT NULL,
    "withdrawalVersionId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseConsent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseConsent_userId_createdAt_idx" ON "PurchaseConsent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PurchaseConsent_subscriptionId_idx" ON "PurchaseConsent"("subscriptionId");

-- CreateIndex
CREATE INDEX "PurchaseConsent_createdAt_idx" ON "PurchaseConsent"("createdAt");

-- AddForeignKey
ALTER TABLE "PurchaseConsent" ADD CONSTRAINT "PurchaseConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseConsent" ADD CONSTRAINT "PurchaseConsent_termsVersionId_fkey" FOREIGN KEY ("termsVersionId") REFERENCES "LegalVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseConsent" ADD CONSTRAINT "PurchaseConsent_withdrawalVersionId_fkey" FOREIGN KEY ("withdrawalVersionId") REFERENCES "LegalVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseConsent" ADD CONSTRAINT "PurchaseConsent_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
