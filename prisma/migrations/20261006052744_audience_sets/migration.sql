-- CreateTable
CREATE TABLE "AudienceSet" (
    "audience" TEXT NOT NULL,
    "featureSetId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudienceSet_pkey" PRIMARY KEY ("audience")
);

-- AddForeignKey
ALTER TABLE "AudienceSet" ADD CONSTRAINT "AudienceSet_featureSetId_fkey" FOREIGN KEY ("featureSetId") REFERENCES "FeatureSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
