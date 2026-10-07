-- AlterTable
ALTER TABLE "UsageEvent" ADD COLUMN     "exportKind" TEXT;

-- CreateIndex
CREATE INDEX "UsageEvent_userId_createdAt_idx" ON "UsageEvent"("userId", "createdAt");
