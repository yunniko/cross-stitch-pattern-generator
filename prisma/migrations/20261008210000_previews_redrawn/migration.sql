-- G-119: previews now draw half stitches and backstitch (D362). The old ones are dropped and drawn again on first request.
-- AlterTable
ALTER TABLE "Stamp" ALTER COLUMN "preview" DROP NOT NULL;

UPDATE "Stamp" SET "preview" = NULL;
UPDATE "SavedChart" SET "preview" = NULL;
