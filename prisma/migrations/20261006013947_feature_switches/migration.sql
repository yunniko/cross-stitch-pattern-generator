-- CreateEnum
CREATE TYPE "FeatureSwitch" AS ENUM ('ON', 'LOCKED', 'HIDDEN');

-- AlterTable
ALTER TABLE "Tier" ADD COLUMN     "featureSetId" TEXT;

-- CreateTable
CREATE TABLE "FeatureState" (
    "featureId" TEXT NOT NULL,
    "state" "FeatureSwitch" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "FeatureState_pkey" PRIMARY KEY ("featureId")
);

-- CreateTable
CREATE TABLE "UserFeature" (
    "userId" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "state" "FeatureSwitch" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "UserFeature_pkey" PRIMARY KEY ("userId","featureId")
);

-- CreateTable
CREATE TABLE "FeatureSet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureSetEntry" (
    "setId" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "state" "FeatureSwitch" NOT NULL,

    CONSTRAINT "FeatureSetEntry_pkey" PRIMARY KEY ("setId","featureId")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeatureSet_name_key" ON "FeatureSet"("name");

-- AddForeignKey
ALTER TABLE "Tier" ADD CONSTRAINT "Tier_featureSetId_fkey" FOREIGN KEY ("featureSetId") REFERENCES "FeatureSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFeature" ADD CONSTRAINT "UserFeature_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureSetEntry" ADD CONSTRAINT "FeatureSetEntry_setId_fkey" FOREIGN KEY ("setId") REFERENCES "FeatureSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
