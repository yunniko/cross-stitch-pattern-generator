-- CreateTable
CREATE TABLE "FeatureChange" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "change" TEXT NOT NULL,
    "byUserId" TEXT NOT NULL,
    "byEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeatureChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeatureChange_createdAt_idx" ON "FeatureChange"("createdAt");
