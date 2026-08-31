-- Product names become the stable, human-readable leaf in the BambuBuddy
-- creator/product hierarchy. Guard both exact and normalized duplicates.
CREATE UNIQUE INDEX "Product_publicName_key" ON "Product"("publicName");
CREATE UNIQUE INDEX "Product_publicName_normalized_key"
ON "Product" (lower(btrim("publicName")));

CREATE TYPE "ProductArtifactKind" AS ENUM ('PROCESSED_3MF', 'PRINT_READY');
CREATE TYPE "ApplicationFileKind" AS ENUM ('P2S_REFERENCE');

CREATE TABLE "ProductSourceFile" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mediaType" TEXT,
    "sizeBytes" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "packageManifest" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductSourceFile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductArtifact" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "kind" "ProductArtifactKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "downloadName" TEXT NOT NULL,
    "mediaType" TEXT,
    "sizeBytes" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "sourceFileId" TEXT,
    "sourceArchiveEntryPath" TEXT,
    "basedOnProcessedSha256" TEXT,
    "publishedSha256" TEXT,
    "bambuBuddyTagsSyncedAt" TIMESTAMP(3),
    "lastPublishAttemptAt" TIMESTAMP(3),
    "lastPublishError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductArtifact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApplicationFile" (
    "id" TEXT NOT NULL,
    "kind" "ApplicationFileKind" NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mediaType" TEXT,
    "sizeBytes" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "extractedSettings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationFile_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AppSetting"
ADD COLUMN "fileUploadMaxBytes" BIGINT NOT NULL DEFAULT 2147483648,
ADD COLUMN "zipExpandedMaxBytes" BIGINT NOT NULL DEFAULT 10737418240,
ADD COLUMN "zipMaxEntries" INTEGER NOT NULL DEFAULT 10000,
ADD COLUMN "zipMaxCompressionRatio" INTEGER NOT NULL DEFAULT 100;

CREATE UNIQUE INDEX "ProductSourceFile_storageKey_key" ON "ProductSourceFile"("storageKey");
CREATE INDEX "ProductSourceFile_productId_createdAt_idx" ON "ProductSourceFile"("productId", "createdAt");
CREATE INDEX "ProductSourceFile_sha256_idx" ON "ProductSourceFile"("sha256");

CREATE UNIQUE INDEX "ProductArtifact_storageKey_key" ON "ProductArtifact"("storageKey");
CREATE UNIQUE INDEX "ProductArtifact_productId_kind_key" ON "ProductArtifact"("productId", "kind");
CREATE INDEX "ProductArtifact_sourceFileId_idx" ON "ProductArtifact"("sourceFileId");
CREATE INDEX "ProductArtifact_sha256_idx" ON "ProductArtifact"("sha256");

CREATE UNIQUE INDEX "ApplicationFile_kind_key" ON "ApplicationFile"("kind");
CREATE UNIQUE INDEX "ApplicationFile_storageKey_key" ON "ApplicationFile"("storageKey");

ALTER TABLE "ProductSourceFile"
ADD CONSTRAINT "ProductSourceFile_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductArtifact"
ADD CONSTRAINT "ProductArtifact_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductArtifact"
ADD CONSTRAINT "ProductArtifact_sourceFileId_fkey"
FOREIGN KEY ("sourceFileId") REFERENCES "ProductSourceFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
