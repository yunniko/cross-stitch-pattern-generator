-- G-128 M1: the published versions of the terms, the privacy policy and the withdrawal acknowledgment (D383).
CREATE TABLE "LegalVersion" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedBy" TEXT NOT NULL,

    CONSTRAINT "LegalVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LegalVersion_kind_version_key" ON "LegalVersion"("kind", "version");