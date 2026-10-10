-- CreateTable
CREATE TABLE "Palette" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "colors" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Palette_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Palette_userId_updatedAt_idx" ON "Palette"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Palette_userId_name_key" ON "Palette"("userId", "name");

-- AddForeignKey
ALTER TABLE "Palette" ADD CONSTRAINT "Palette_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;