-- G-129 M2 (D387): when a subscription began, and a consumer's withdrawal from it.
-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "startedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Withdrawal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT NOT NULL,
    "refunds" JSONB NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Withdrawal_stripeSubscriptionId_key" ON "Withdrawal"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "Withdrawal_userId_requestedAt_idx" ON "Withdrawal"("userId", "requestedAt");

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;