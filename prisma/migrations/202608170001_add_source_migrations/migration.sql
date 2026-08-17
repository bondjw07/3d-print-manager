CREATE TYPE "SourceMigrationStatus" AS ENUM ('PENDING', 'APPLIED', 'SKIPPED', 'CONFLICT');

CREATE TABLE "SourceMigration" (
    "id" TEXT NOT NULL,
    "sourceCreator" TEXT NOT NULL,
    "sourceCreatorUrl" TEXT,
    "targetCreator" TEXT NOT NULL,
    "targetCreatorUrl" TEXT NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,

    CONSTRAINT "SourceMigration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SourceMigrationRow" (
    "id" TEXT NOT NULL,
    "migrationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "oldReferenceId" TEXT,
    "oldSourceUrl" TEXT,
    "oldNormalizedUrl" TEXT,
    "targetTitle" TEXT,
    "targetReferenceId" TEXT,
    "targetSourceUrl" TEXT,
    "targetNormalizedUrl" TEXT,
    "matchMethod" TEXT,
    "confidence" INTEGER,
    "status" "SourceMigrationStatus" NOT NULL DEFAULT 'PENDING',
    "appliedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceMigrationRow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SourceMigrationRow_migrationId_productId_key" ON "SourceMigrationRow"("migrationId", "productId");
CREATE INDEX "SourceMigration_scannedAt_idx" ON "SourceMigration"("scannedAt");
CREATE INDEX "SourceMigrationRow_migrationId_status_idx" ON "SourceMigrationRow"("migrationId", "status");
CREATE INDEX "SourceMigrationRow_targetReferenceId_idx" ON "SourceMigrationRow"("targetReferenceId");

ALTER TABLE "SourceMigrationRow" ADD CONSTRAINT "SourceMigrationRow_migrationId_fkey" FOREIGN KEY ("migrationId") REFERENCES "SourceMigration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SourceMigrationRow" ADD CONSTRAINT "SourceMigrationRow_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
