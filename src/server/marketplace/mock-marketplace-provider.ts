import { humanizeEnum } from "@/lib/domain";
import { type MarketplaceType } from "@/generated/prisma/client";
import { type MarketplaceActionResult, type MarketplaceProvider } from "./provider";

function buildMessage(action: string, marketplaceType: MarketplaceType) {
  return `Mock ${action} completed for ${humanizeEnum(marketplaceType)}.`;
}

function result(action: string, marketplaceType: MarketplaceType): MarketplaceActionResult {
  return {
    ok: true,
    message: buildMessage(action, marketplaceType),
    syncedAt: new Date(),
  };
}

export class MockMarketplaceProvider implements MarketplaceProvider {
  async publishListing(_listingId: string, marketplaceType: MarketplaceType) {
    return result("publish", marketplaceType);
  }

  async updateListing(_listingId: string, marketplaceType: MarketplaceType) {
    return result("update", marketplaceType);
  }

  async removeListing(_listingId: string, marketplaceType: MarketplaceType) {
    return result("remove", marketplaceType);
  }

  async refreshListing(_listingId: string, marketplaceType: MarketplaceType) {
    return result("refresh", marketplaceType);
  }
}

export const mockMarketplaceProvider = new MockMarketplaceProvider();
