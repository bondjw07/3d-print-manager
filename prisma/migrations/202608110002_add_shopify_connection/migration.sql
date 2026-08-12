ALTER TABLE "AppSetting"
ADD COLUMN "shopifyShopDomain" TEXT,
ADD COLUMN "shopifyClientIdEncrypted" TEXT,
ADD COLUMN "shopifyClientSecretEncrypted" TEXT,
ADD COLUMN "shopifyAccessTokenEncrypted" TEXT,
ADD COLUMN "shopifyTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN "shopifyTokenScope" TEXT,
ADD COLUMN "shopifyConnectedAt" TIMESTAMP(3),
ADD COLUMN "shopifyShopName" TEXT;
