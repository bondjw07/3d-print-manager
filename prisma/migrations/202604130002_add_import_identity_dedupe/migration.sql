-- CreateEnum
CREATE TYPE "ProductImportSource" AS ENUM ('THANGS', 'MY_MINI_FACTORY', 'LOOT_STUDIOS');

-- AlterTable
ALTER TABLE "Product"
ADD COLUMN "importSource" "ProductImportSource",
ADD COLUMN "importSourceReferenceId" TEXT,
ADD COLUMN "importSourceUrl" TEXT,
ADD COLUMN "importSourceNormalizedUrl" TEXT,
ADD COLUMN "importSourceCreatorName" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Product_importSource_importSourceReferenceId_key" ON "Product"("importSource", "importSourceReferenceId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_importSource_importSourceNormalizedUrl_key" ON "Product"("importSource", "importSourceNormalizedUrl");
