import { type MarketplaceType } from "@/generated/prisma/client";
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

export async function getDefaultMarketplace() {
  const settings = await getSettings();
  return settings.defaultMarketplace;
}
