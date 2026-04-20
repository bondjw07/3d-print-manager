-- Add hashed passwords for credential-based login.
ALTER TABLE "User"
ADD COLUMN "passwordHash" TEXT;

-- Backfill existing seeded demo users so migrations do not lock out local environments.
UPDATE "User"
SET "passwordHash" = 'scrypt$16384$8$1$56BdH17NwhJi_SqPARvhXQ$20p3uR3OGDx2OcOpfQBmJQogOz1IXsHa1sUrlZ6h89nlJOBVOBoo3MVTbtTNE_8NESeVCq-F21KI3ZR6kKTG1g'
WHERE "email" = 'admin@portal.local'
  AND "passwordHash" IS NULL;

UPDATE "User"
SET "passwordHash" = 'scrypt$16384$8$1$PQViDrzKp5QtcUxLsIAGLA$HrK7ose0RT3xJrzvPO6XXOQikWK5J4Kx8QG3KfMiwQDAUBy0MtfqfHvrtNoIFqOiKY5C3sh7EE2gCl7x-lofFA'
WHERE "email" = 'alex@portal.local'
  AND "passwordHash" IS NULL;

UPDATE "User"
SET "passwordHash" = 'scrypt$16384$8$1$LzXvhj0DwmlZGUuUtacqBA$GUY8QQwP4NeDDleifxhaYfSZQuWoc7DwMVpm_h0fllcCiENSZucjkMNkYF2YS0v0_6bXInFsyOeWIuekpEMTCw'
WHERE "email" = 'mia@portal.local'
  AND "passwordHash" IS NULL;
