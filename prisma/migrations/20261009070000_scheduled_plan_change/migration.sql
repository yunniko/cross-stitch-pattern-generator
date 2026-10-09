-- G-129 M3 (D388): the price a change of plan moves to at the next renewal.
-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "scheduledPriceId" TEXT;
