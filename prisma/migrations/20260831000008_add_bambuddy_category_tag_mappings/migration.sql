CREATE TABLE "BambuBuddyCategoryTagMapping" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "bambuBuddyTag" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BambuBuddyCategoryTagMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BambuBuddyCategoryTagMapping_category_key" ON "BambuBuddyCategoryTagMapping"("category");
