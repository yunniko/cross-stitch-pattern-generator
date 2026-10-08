-- G-126 M1: the site's settings, one row per setting the admin has set (D374). No row means the default.
CREATE TABLE "SiteSetting" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("key")
);

-- G-126 M1: a dispute or a refund finds its subscription by the customer.
CREATE INDEX "Subscription_stripeCustomerId_idx" ON "Subscription"("stripeCustomerId");