import {
  EventProcessingStatus,
  ListingStatus,
  MarketplaceEventType,
  QueuePriority,
  QueueSourceType,
  QueueStatus,
  SyncStatus,
  type MarketplaceType,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { recalculateInventoryAvailable } from "./inventory-service";

export async function getMarketplaceEvents(limit = 25) {
  return prisma.marketplaceEvent.findMany({
    include: {
      relatedListing: {
        include: { product: true },
      },
      relatedProduct: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function simulateMarketplaceEvent(input: {
  marketplaceType: MarketplaceType;
  eventType: MarketplaceEventType;
  payloadSummary: string;
  relatedListingId?: string;
  relatedProductId?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const event = await tx.marketplaceEvent.create({
      data: {
        marketplaceType: input.marketplaceType,
        eventType: input.eventType,
        payloadSummary: input.payloadSummary,
        relatedListingId: input.relatedListingId || null,
        relatedProductId: input.relatedProductId || null,
        processingStatus: EventProcessingStatus.PENDING,
      },
    });

    if (input.eventType === MarketplaceEventType.SALE_OCCURRED) {
      const listing = input.relatedListingId
        ? await tx.marketplaceListing.findUnique({ where: { id: input.relatedListingId } })
        : null;
      const productId = input.relatedProductId || listing?.productId;

      if (!productId) {
        return tx.marketplaceEvent.update({
          where: { id: event.id },
          data: {
            processingStatus: EventProcessingStatus.FAILED,
            processingMessage: "No related product found for mock sale.",
            processedAt: new Date(),
          },
        });
      }

      const queueItem = await tx.queueItem.create({
        data: {
          productId,
          sourceType: QueueSourceType.MARKETPLACE,
          sourceReferenceId: `event:${event.id}`,
          quantity: 1,
          status: QueueStatus.PENDING,
          priority: QueuePriority.HIGH,
          notes: "Generated from simulated marketplace sale event.",
        },
      });

      const inventory = await tx.inventoryRecord.findUnique({ where: { productId } });
      if (inventory) {
        const committed = inventory.committed + 1;
        await tx.inventoryRecord.update({
          where: { id: inventory.id },
          data: {
            committed,
            available: recalculateInventoryAvailable(inventory.onHand, inventory.reserved, committed),
          },
        });
      }

      return tx.marketplaceEvent.update({
        where: { id: event.id },
        data: {
          processingStatus: EventProcessingStatus.PROCESSED,
          processingMessage: `Mock sale created queue item ${queueItem.id}.`,
          processedAt: new Date(),
        },
      });
    }

    if (input.eventType === MarketplaceEventType.LISTING_REMOVED && input.relatedListingId) {
      await tx.marketplaceListing.update({
        where: { id: input.relatedListingId },
        data: {
          status: ListingStatus.REMOVED,
          syncStatus: SyncStatus.NEEDS_REVIEW,
          lastSyncMessage: "Marked removed via mock marketplace event.",
          lastSyncedAt: new Date(),
        },
      });
    }

    if (input.eventType === MarketplaceEventType.LISTING_CHANGED_EXTERNALLY && input.relatedListingId) {
      await tx.marketplaceListing.update({
        where: { id: input.relatedListingId },
        data: {
          syncStatus: SyncStatus.NEEDS_REVIEW,
          lastSyncMessage: "External listing change detected.",
          lastSyncedAt: new Date(),
        },
      });
    }

    return tx.marketplaceEvent.update({
      where: { id: event.id },
      data: {
        processingStatus: EventProcessingStatus.PROCESSED,
        processingMessage: "Mock event processed.",
        processedAt: new Date(),
      },
    });
  });
}
