-- G-126 M2: while an invoice is failing, Stripe's next try, its payment page, and whether the bank waits on the person.
ALTER TABLE "Subscription" ADD COLUMN "nextAttemptAt" TIMESTAMP(3),
ADD COLUMN "payUrl" TEXT,
ADD COLUMN "actionNeeded" BOOLEAN NOT NULL DEFAULT false;

-- G-126 M2: the messages a failing renewal sends, one per failure and slot (D377).
CREATE TABLE "BillingNotice" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "failedAt" TIMESTAMP(3) NOT NULL,
    "slot" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "values" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BillingNotice_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BillingNotice_sentAt_createdAt_idx" ON "BillingNotice"("sentAt", "createdAt");

CREATE UNIQUE INDEX "BillingNotice_subscriptionId_failedAt_slot_key" ON "BillingNotice"("subscriptionId", "failedAt", "slot");

ALTER TABLE "BillingNotice" ADD CONSTRAINT "BillingNotice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;