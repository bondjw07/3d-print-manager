import { type MarketplaceType } from "@/generated/prisma/client";
import {
  DEFAULT_PROCESSING_ESTIMATE_SETTINGS,
  type ProcessingEstimateSettings,
  resolveProcessingEstimateSettings,
} from "@/lib/processing-time-estimates";
import { prisma } from "@/lib/prisma";

export async function getSettings() {
  const settings = await prisma.appSetting.findUnique({ where: { id: "app" } });
  if (settings) {
    return settings;
  }

  return prisma.appSetting.create({ data: { id: "app", defaultMarketplace: "ETSY" } });
}

export async function updateDefaultMarketplace(defaultMarketplace: MarketplaceType) {
  return prisma.appSetting.upsert({
    where: { id: "app" },
    create: { id: "app", defaultMarketplace },
    update: { defaultMarketplace },
  });
}

export async function updateAppVersion(appVersion: string) {
  return prisma.appSetting.upsert({
    where: { id: "app" },
    create: { id: "app", defaultMarketplace: "ETSY", appVersion },
    update: { appVersion },
  });
}

export async function updatePublicAppUrl(publicAppUrl: string) {
  return prisma.appSetting.upsert({
    where: { id: "app" },
    create: { id: "app", defaultMarketplace: "ETSY", publicAppUrl },
    update: { publicAppUrl },
  });
}

export async function updateBambuBuddyBaseUrl(bambuBuddyBaseUrl: string) {
  return prisma.appSetting.upsert({
    where: { id: "app" },
    create: { id: "app", defaultMarketplace: "ETSY", bambuBuddyBaseUrl },
    update: { bambuBuddyBaseUrl },
  });
}

export async function updateProductCategories(productCategories: string[]) {
  return prisma.appSetting.upsert({
    where: { id: "app" },
    create: { id: "app", defaultMarketplace: "ETSY", productCategories },
    update: { productCategories },
  });
}

export function getProcessingEstimateSettingsFromAppSetting(input: {
  printerCount: unknown;
  printerUtilizationRate: unknown;
  baselineGramsPerHour: unknown;
  complexityMultiplier: unknown;
  fixedHoursPerPrint: unknown;
}): ProcessingEstimateSettings {
  return resolveProcessingEstimateSettings({
    printerCount: Number(input.printerCount),
    printerUtilizationRate: Number(input.printerUtilizationRate),
    baselineGramsPerHour: Number(input.baselineGramsPerHour),
    complexityMultiplier: Number(input.complexityMultiplier),
    fixedHoursPerPrint: Number(input.fixedHoursPerPrint),
  });
}

async function ensureProcessingEstimateColumns() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "AppSetting"
    ADD COLUMN IF NOT EXISTS "printerCount" INTEGER NOT NULL DEFAULT 3
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "AppSetting"
    ADD COLUMN IF NOT EXISTS "printerUtilizationRate" DECIMAL(4,2) NOT NULL DEFAULT 0.6
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "AppSetting"
    ADD COLUMN IF NOT EXISTS "baselineGramsPerHour" DECIMAL(6,2) NOT NULL DEFAULT 31.6
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "AppSetting"
    ADD COLUMN IF NOT EXISTS "complexityMultiplier" DECIMAL(4,2) NOT NULL DEFAULT 1.15
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "AppSetting"
    ADD COLUMN IF NOT EXISTS "fixedHoursPerPrint" DECIMAL(4,2) NOT NULL DEFAULT 0.5
  `);
}

export async function getProcessingEstimateSettings() {
  await ensureProcessingEstimateColumns();

  const rows = await prisma.$queryRaw<
    Array<{
      printerCount: unknown;
      printerUtilizationRate: unknown;
      baselineGramsPerHour: unknown;
      complexityMultiplier: unknown;
      fixedHoursPerPrint: unknown;
    }>
  >`
    SELECT
      "printerCount",
      "printerUtilizationRate",
      "baselineGramsPerHour",
      "complexityMultiplier",
      "fixedHoursPerPrint"
    FROM "AppSetting"
    WHERE "id" = 'app'
    LIMIT 1
  `;

  if (rows.length === 0) {
    return DEFAULT_PROCESSING_ESTIMATE_SETTINGS;
  }

  return getProcessingEstimateSettingsFromAppSetting(rows[0]);
}

export async function updateProcessingEstimateSettings(settings: ProcessingEstimateSettings) {
  await ensureProcessingEstimateColumns();

  await prisma.$executeRaw`
    INSERT INTO "AppSetting" (
      "id",
      "updatedAt",
      "printerCount",
      "printerUtilizationRate",
      "baselineGramsPerHour",
      "complexityMultiplier",
      "fixedHoursPerPrint"
    )
    VALUES (
      'app',
      NOW(),
      ${settings.printerCount},
      ${settings.printerUtilizationRate}::numeric,
      ${settings.baselineGramsPerHour}::numeric,
      ${settings.complexityMultiplier}::numeric,
      ${settings.fixedHoursPerPrint}::numeric
    )
    ON CONFLICT ("id")
    DO UPDATE SET
      "printerCount" = EXCLUDED."printerCount",
      "printerUtilizationRate" = EXCLUDED."printerUtilizationRate",
      "baselineGramsPerHour" = EXCLUDED."baselineGramsPerHour",
      "complexityMultiplier" = EXCLUDED."complexityMultiplier",
      "fixedHoursPerPrint" = EXCLUDED."fixedHoursPerPrint",
      "updatedAt" = NOW()
  `;

  return getProcessingEstimateSettings();
}

export async function getDefaultMarketplace() {
  const settings = await getSettings();
  return settings.defaultMarketplace;
}
