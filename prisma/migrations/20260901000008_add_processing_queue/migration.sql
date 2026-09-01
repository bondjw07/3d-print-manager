CREATE TYPE "ProductFileJobKind" AS ENUM (
    'SOURCE_INSPECTION',
    'MAPPING_INSPECTION',
    'PROCESSED_GENERATION',
    'BAMBUDDY_PUBLISH'
);

CREATE TYPE "ProductFileJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "SourceInspectionStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED');

ALTER TABLE "ProductSourceFile"
ADD COLUMN "inspectionStatus" "SourceInspectionStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "threeMfCandidateCount" INTEGER,
ADD COLUMN "inspectionError" TEXT,
ADD COLUMN "inspectedAt" TIMESTAMP(3);

UPDATE "ProductSourceFile"
SET
    "inspectionStatus" = CASE WHEN "packageManifest" IS NULL THEN 'PENDING'::"SourceInspectionStatus" ELSE 'SUCCEEDED'::"SourceInspectionStatus" END,
    "threeMfCandidateCount" = CASE
        WHEN "packageManifest" IS NULL THEN NULL
        ELSE jsonb_array_length(COALESCE("packageManifest"->'threeMfCandidates', '[]'::jsonb))
    END,
    "inspectedAt" = CASE WHEN "packageManifest" IS NULL THEN NULL ELSE "createdAt" END;

CREATE TABLE "ProductMappingDraft" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sourceFileId" TEXT NOT NULL,
    "entryPath" TEXT,
    "sourceSha256" TEXT NOT NULL,
    "referenceSha256" TEXT NOT NULL,
    "mappingFingerprint" TEXT NOT NULL,
    "inspection" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductMappingDraft_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductFileJob" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sourceFileId" TEXT,
    "kind" "ProductFileJobKind" NOT NULL,
    "status" "ProductFileJobStatus" NOT NULL DEFAULT 'QUEUED',
    "phase" TEXT,
    "progress" INTEGER,
    "payload" JSONB,
    "result" JSONB,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductFileJob_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductFileJob_progress_check" CHECK ("progress" IS NULL OR ("progress" >= 0 AND "progress" <= 100))
);

CREATE UNIQUE INDEX "ProductMappingDraft_productId_key" ON "ProductMappingDraft"("productId");
CREATE INDEX "ProductMappingDraft_sourceFileId_idx" ON "ProductMappingDraft"("sourceFileId");
CREATE INDEX "ProductSourceFile_productId_inspectionStatus_idx" ON "ProductSourceFile"("productId", "inspectionStatus");
CREATE INDEX "ProductFileJob_status_availableAt_createdAt_idx" ON "ProductFileJob"("status", "availableAt", "createdAt");
CREATE INDEX "ProductFileJob_productId_createdAt_idx" ON "ProductFileJob"("productId", "createdAt");
CREATE INDEX "ProductFileJob_sourceFileId_idx" ON "ProductFileJob"("sourceFileId");
CREATE UNIQUE INDEX "ProductFileJob_one_active_source_inspection"
ON "ProductFileJob"("sourceFileId", "kind")
WHERE "status" IN ('QUEUED', 'RUNNING') AND "kind" = 'SOURCE_INSPECTION';
CREATE UNIQUE INDEX "ProductFileJob_one_active_kind_per_product"
ON "ProductFileJob"("productId", "kind")
WHERE "status" IN ('QUEUED', 'RUNNING') AND "kind" <> 'SOURCE_INSPECTION';

ALTER TABLE "ProductMappingDraft"
ADD CONSTRAINT "ProductMappingDraft_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductMappingDraft"
ADD CONSTRAINT "ProductMappingDraft_sourceFileId_fkey"
FOREIGN KEY ("sourceFileId") REFERENCES "ProductSourceFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductFileJob"
ADD CONSTRAINT "ProductFileJob_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductFileJob"
ADD CONSTRAINT "ProductFileJob_sourceFileId_fkey"
FOREIGN KEY ("sourceFileId") REFERENCES "ProductSourceFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
