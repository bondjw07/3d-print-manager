CREATE TABLE "SourceMigrationTarget" (
    "id" TEXT NOT NULL,
    "migrationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "normalizedUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceMigrationTarget_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SourceMigrationTarget_migrationId_referenceId_key" ON "SourceMigrationTarget"("migrationId", "referenceId");
CREATE INDEX "SourceMigrationTarget_migrationId_title_idx" ON "SourceMigrationTarget"("migrationId", "title");

ALTER TABLE "SourceMigrationTarget" ADD CONSTRAINT "SourceMigrationTarget_migrationId_fkey" FOREIGN KEY ("migrationId") REFERENCES "SourceMigration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
