import { type MarketplaceType } from "@/generated/prisma/client";

export type MarketplaceActionResult = {
  ok: boolean;
  message: string;
  syncedAt: Date;
};

export interface MarketplaceProvider {
  publishListing(listingId: string, marketplaceType: MarketplaceType): Promise<MarketplaceActionResult>;
  updateListing(listingId: string, marketplaceType: MarketplaceType): Promise<MarketplaceActionResult>;
  removeListing(listingId: string, marketplaceType: MarketplaceType): Promise<MarketplaceActionResult>;
  refreshListing(listingId: string, marketplaceType: MarketplaceType): Promise<MarketplaceActionResult>;
}
