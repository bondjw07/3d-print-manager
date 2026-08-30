ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "bambuBuddyFileId" TEXT,
  ADD COLUMN IF NOT EXISTS "bambuBuddyPrintTimeSeconds" INTEGER,
  ADD COLUMN IF NOT EXISTS "bambuBuddyFilamentUsedGrams" DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS "bambuBuddyLastSyncedAt" TIMESTAMP(3);
