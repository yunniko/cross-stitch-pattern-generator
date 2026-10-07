/*
  Warnings:

  - You are about to drop the column `limits` on the `Tier` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Tier" DROP COLUMN "limits";

-- CreateTable
CREATE TABLE "SiteLimit" (
    "limitId" TEXT NOT NULL,
    "value" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "SiteLimit_pkey" PRIMARY KEY ("limitId")
);

-- CreateTable
CREATE TABLE "AudienceLimit" (
    "audience" TEXT NOT NULL,
    "limitId" TEXT NOT NULL,
    "value" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "AudienceLimit_pkey" PRIMARY KEY ("audience","limitId")
);

-- CreateTable
CREATE TABLE "TierLimit" (
    "tierId" TEXT NOT NULL,
    "limitId" TEXT NOT NULL,
    "value" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "TierLimit_pkey" PRIMARY KEY ("tierId","limitId")
);

-- CreateTable
CREATE TABLE "UserLimit" (
    "userId" TEXT NOT NULL,
    "limitId" TEXT NOT NULL,
    "value" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "UserLimit_pkey" PRIMARY KEY ("userId","limitId")
);

-- AddForeignKey
ALTER TABLE "TierLimit" ADD CONSTRAINT "TierLimit_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "Tier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLimit" ADD CONSTRAINT "UserLimit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
