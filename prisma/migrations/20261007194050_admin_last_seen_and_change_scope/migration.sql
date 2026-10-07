-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastSeenAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "FeatureChange_scope_createdAt_idx" ON "FeatureChange"("scope", "createdAt");
