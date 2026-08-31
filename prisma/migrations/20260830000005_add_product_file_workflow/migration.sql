-- Product names become the stable, human-readable leaf in the BambuBuddy
-- creator/product hierarchy. Guard both exact and normalized duplicates.
-- Preserve the oldest product for each normalized name. The later duplicates
-- remain intact but receive a deterministic, actionable suffix before the new
-- indexes are created. Administrators can rename them to a better public name
-- after the migration without losing product history or linked records.
WITH ranked_products AS (
    SELECT
        "id",
        btrim("publicName") AS trimmed_public_name,
        row_number() OVER (
            PARTITION BY lower(btrim("publicName"))
            ORDER BY "createdAt" ASC, "id" ASC
        ) AS duplicate_rank
    FROM "Product"
)
UPDATE "Product" AS product
SET "publicName" = ranked_products.trimmed_public_name || ' (Duplicate ' || ranked_products."id" || ')'
FROM ranked_products
WHERE product."id" = ranked_products."id"
  AND ranked_products.duplicate_rank > 1;

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
