CREATE TABLE "PricingTier" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "suggestedPrice" DECIMAL(10,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingTier_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Product" ADD COLUMN "pricingTierId" TEXT;

CREATE UNIQUE INDEX "PricingTier_category_label_key" ON "PricingTier"("category", "label");
CREATE INDEX "PricingTier_category_sortOrder_idx" ON "PricingTier"("category", "sortOrder");
CREATE INDEX "Product_pricingTierId_idx" ON "Product"("pricingTierId");

ALTER TABLE "Product" ADD CONSTRAINT "Product_pricingTierId_fkey" FOREIGN KEY ("pricingTierId") REFERENCES "PricingTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
