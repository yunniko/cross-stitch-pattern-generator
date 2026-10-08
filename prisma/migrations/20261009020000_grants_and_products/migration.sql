-- G-127 M1: a subscription bought at the provider, or given by an admin by hand (D379).
ALTER TABLE "Subscription" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'stripe';

-- G-127 M1: the provider's product a tier's prices belong to.
ALTER TABLE "Tier" ADD COLUMN "stripeProductId" TEXT;
CREATE UNIQUE INDEX "Tier_stripeProductId_key" ON "Tier"("stripeProductId");