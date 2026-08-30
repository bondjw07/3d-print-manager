CREATE TABLE "BambuBuddyFilamentMapping" (
  "id" TEXT NOT NULL,
  "materialType" TEXT NOT NULL,
  "hexColor" TEXT NOT NULL,
  "manufacturer" TEXT,
  "colorName" TEXT NOT NULL,
  "materialName" TEXT,
  "effectType" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BambuBuddyFilamentMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BambuBuddyFilamentMapping_materialType_hexColor_key" ON "BambuBuddyFilamentMapping"("materialType", "hexColor");
CREATE INDEX "BambuBuddyFilamentMapping_hexColor_idx" ON "BambuBuddyFilamentMapping"("hexColor");

CREATE TABLE "ProductBambuBuddyFilamentRequirement" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "materialType" TEXT NOT NULL,
  "hexColor" TEXT NOT NULL,
  "estimatedGramsPerPrint" DECIMAL(8,2) NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ProductBambuBuddyFilamentRequirement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductBambuBuddyFilamentRequirement_productId_materialType_hexColor_key" ON "ProductBambuBuddyFilamentRequirement"("productId", "materialType", "hexColor");
CREATE INDEX "ProductBambuBuddyFilamentRequirement_productId_sortOrder_idx" ON "ProductBambuBuddyFilamentRequirement"("productId", "sortOrder");
ALTER TABLE "ProductBambuBuddyFilamentRequirement" ADD CONSTRAINT "ProductBambuBuddyFilamentRequirement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AppSetting" ADD COLUMN IF NOT EXISTS "defaultFilamentSpoolCost" DECIMAL(10, 2) NOT NULL DEFAULT 20;
