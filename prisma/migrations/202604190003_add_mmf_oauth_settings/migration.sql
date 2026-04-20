-- AlterTable
ALTER TABLE "AppSetting"
ADD COLUMN "myMiniFactoryClientIdHash" TEXT,
ADD COLUMN "myMiniFactoryClientIdEncrypted" TEXT,
ADD COLUMN "myMiniFactoryClientSecretHash" TEXT,
ADD COLUMN "myMiniFactoryClientSecretEncrypted" TEXT,
ADD COLUMN "myMiniFactoryAccessTokenEncrypted" TEXT,
ADD COLUMN "myMiniFactoryRefreshTokenEncrypted" TEXT,
ADD COLUMN "myMiniFactoryTokenType" TEXT,
ADD COLUMN "myMiniFactoryTokenScope" TEXT,
ADD COLUMN "myMiniFactoryTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN "myMiniFactoryConnectedAt" TIMESTAMP(3),
ADD COLUMN "myMiniFactoryOauthStateHash" TEXT,
ADD COLUMN "myMiniFactoryOauthStateExpiresAt" TIMESTAMP(3),
ADD COLUMN "myMiniFactoryOauthRedirectUri" TEXT;
