-- AlterTable
ALTER TABLE "SavedChart" ADD COLUMN     "brand" TEXT,
ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false;

-- Charts saved before: the brand read from the stored file, as a save now records it.
UPDATE "SavedChart" SET "brand" = ("document"::jsonb)->>'threadBrand'
WHERE ("document"::jsonb)->>'threadBrand' IN ('dmc', 'cosmo', 'anchor');