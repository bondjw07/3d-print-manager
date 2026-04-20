import { prisma } from "@/lib/prisma";
import { getLowStockItems } from "./inventory-service";
import { getListingsNeedingReviewCount } from "./listing-service";
import { getMarketplaceEvents } from "./marketplace-event-service";
import { getRecentQueueItems, getQueueStatusCounts } from "./queue-service";
import { getPendingRequestCount } from "./request-service";

export async function getDashboardSummary() {
  const [pendingRequests, queueByStatus, lowStockItems, listingsNeedingReview, recentEvents, recentQueue] =
    await Promise.all([
      getPendingRequestCount(),
      getQueueStatusCounts(),
      getLowStockItems(),
      getListingsNeedingReviewCount(),
      getMarketplaceEvents(5),
      getRecentQueueItems(6),
    ]);

  return {
    pendingRequests,
    queueByStatus,
    lowStockItems,
    listingsNeedingReview,
    recentEvents,
    recentQueue,
  };
}

export async function getPublicCatalogStats() {
  const [activeProducts, requestableProducts] = await Promise.all([
    prisma.product.count({ where: { isPublic: true, status: "ACTIVE" } }),
    prisma.product.count({ where: { isPublic: true, status: "ACTIVE", isRequestable: true } }),
  ]);

  return {
    activeProducts,
    requestableProducts,
  };
}
