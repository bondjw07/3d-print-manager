CREATE TABLE "ShopifyCategoryTagMapping" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "categoryTag" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopifyCategoryTagMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopifyCategoryTagMapping_category_key" ON "ShopifyCategoryTagMapping"("category");
