-- AlterTable
ALTER TABLE "Filament"
ADD COLUMN "fullRollCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "FilamentPartialRoll" (
    "id" TEXT NOT NULL,
    "filamentId" TEXT NOT NULL,
    "gramsRemaining" DECIMAL(8,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FilamentPartialRoll_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FilamentPartialRoll_filamentId_sortOrder_idx" ON "FilamentPartialRoll"("filamentId", "sortOrder");

-- AddForeignKey
ALTER TABLE "FilamentPartialRoll" ADD CONSTRAINT "FilamentPartialRoll_filamentId_fkey" FOREIGN KEY ("filamentId") REFERENCES "Filament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
