-- AlterTable
ALTER TABLE "Product"
ADD COLUMN "importSourceCreatorUrl" TEXT;

-- AlterTable
ALTER TABLE "Request"
ADD COLUMN "modelScalePercent" DECIMAL(6,2) NOT NULL DEFAULT 100,
ADD COLUMN "filamentScalePercent" DECIMAL(6,2) NOT NULL DEFAULT 100;

-- AlterTable
ALTER TABLE "QueueItem"
ADD COLUMN "modelScalePercent" DECIMAL(6,2) NOT NULL DEFAULT 100,
ADD COLUMN "filamentScalePercent" DECIMAL(6,2) NOT NULL DEFAULT 100;
