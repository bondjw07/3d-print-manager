import {
  ListingStatus,
  SyncStatus,
  type ProductStatus,
  type MarketplaceType,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { mockListingContentProvider } from "@/server/ai/mock-listing-content-provider";
import { mockMarketplaceProvider } from "@/server/marketplace/mock-marketplace-provider";

function parseTags(tagsInput: string) {
  return tagsInput
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export type ListingIndexFilters = {
  page?: number;
  pageSize?: number;
  view?: "listed" | "unlisted";
  search?: string;
  marketplace?: MarketplaceType;
  status?: ListingStatus;
};

export async function getListingProductIndex({
  page = 1,
  pageSize = 24,
  view = "listed",
  search,
  marketplace,
  status,
}: ListingIndexFilters) {
  const normalizedSearch = search?.trim();
  const tagMatchedProductIds = normalizedSearch
    ? (await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "Product"
        WHERE EXISTS (
          SELECT 1
          FROM unnest("tags") AS tag
          WHERE LOWER(tag) = LOWER(${normalizedSearch})
        )
      `).map((product) => product.id)
    : [];
  const listingWhere = {
    ...(marketplace ? { marketplaceType: marketplace } : {}),
    ...(status ? { status } : {}),
  };
  const where = {
    ...(view === "unlisted" ? { listings: { none: {} } } : { listings: { some: listingWhere } }),
    ...(normalizedSearch
      ? {
          OR: [
            { publicName: { contains: normalizedSearch, mode: "insensitive" as const } },
            { sku: { contains: normalizedSearch, mode: "insensitive" as const } },
            { category: { contains: normalizedSearch, mode: "insensitive" as const } },
            ...(tagMatchedProductIds.length > 0 ? [{ id: { in: tagMatchedProductIds } }] : []),
          ],
        }
      : {}),
  };
  const safePage = Math.max(1, page);
  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        images: view === "unlisted"
          ? { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] }
          : { where: { isPrimary: true }, take: 1, orderBy: [{ sortOrder: "asc" }] },
        // Filter which products qualify, but always load every storefront for the one-row-per-product display.
        listings: { orderBy: [{ updatedAt: "desc" }] },
        filamentRequirements: {
          include: { filament: { select: { name: true, spoolCostPerKg: true } } },
          orderBy: [{ sortOrder: "asc" }],
        },
      },
      orderBy: [{ publicName: "asc" }],
      skip: (safePage - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  return { products, total, page: safePage, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getListings(search?: string) {
  return prisma.marketplaceListing.findMany({
    where: search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" } },
            { product: { publicName: { contains: search, mode: "insensitive" } } },
            { externalListingId: { contains: search, mode: "insensitive" } },
          ],
        }
      : undefined,
    include: {
      product: {
        include: {
          images: {
            where: { isPrimary: true },
            take: 1,
            orderBy: [{ sortOrder: "asc" }],
          },
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }],
  });
}

export async function bulkUpdateListingProductControls(input: {
  listingIds: string[];
  status: ProductStatus;
  isPublic: boolean;
  isRequestable: boolean;
}) {
  const selectedListings = await prisma.marketplaceListing.findMany({
    where: {
      id: { in: input.listingIds },
    },
    select: {
      productId: true,
    },
  });

  const productIds = Array.from(new Set(selectedListings.map((listing) => listing.productId)));
  if (productIds.length === 0) {
    return 0;
  }

  const result = await prisma.product.updateMany({
    where: {
      id: { in: productIds },
    },
    data: {
      status: input.status,
      isPublic: input.isPublic,
      isRequestable: input.isRequestable,
    },
  });

  return result.count;
}

export async function createListing(data: {
  productId: string;
  marketplaceType: MarketplaceType;
  externalListingId?: string;
  title: string;
  description: string;
  tags: string;
  price: number;
  externalUrl?: string;
  status: ListingStatus;
  syncStatus: SyncStatus;
}) {
  return prisma.marketplaceListing.upsert({
    where: {
      productId_marketplaceType: {
        productId: data.productId,
        marketplaceType: data.marketplaceType,
      },
    },
    create: {
      ...data,
      tags: parseTags(data.tags),
      externalListingId: data.externalListingId || null,
      externalUrl: data.externalUrl || null,
      lastSyncMessage: null,
    },
    update: {
      ...data,
      tags: parseTags(data.tags),
      externalListingId: data.externalListingId || null,
      externalUrl: data.externalUrl || null,
    },
  });
}

export async function updateListing(listingId: string, data: {
  externalListingId?: string;
  title: string;
  description: string;
  tags: string;
  price: number;
  externalUrl?: string;
  status: ListingStatus;
  syncStatus: SyncStatus;
}) {
  return prisma.marketplaceListing.update({
    where: { id: listingId },
    data: {
      externalListingId: data.externalListingId || null,
      title: data.title,
      description: data.description,
      tags: parseTags(data.tags),
      price: data.price,
      externalUrl: data.externalUrl || null,
      status: data.status,
      syncStatus: data.syncStatus,
    },
  });
}

export async function runListingAction(listingId: string, action: "publish" | "update" | "remove" | "refresh") {
  const listing = await prisma.marketplaceListing.findUnique({ where: { id: listingId } });

  if (!listing) {
    throw new Error("Listing not found");
  }

  const result =
    action === "publish"
      ? await mockMarketplaceProvider.publishListing(listingId, listing.marketplaceType)
      : action === "update"
        ? await mockMarketplaceProvider.updateListing(listingId, listing.marketplaceType)
        : action === "remove"
          ? await mockMarketplaceProvider.removeListing(listingId, listing.marketplaceType)
          : await mockMarketplaceProvider.refreshListing(listingId, listing.marketplaceType);

  let status: ListingStatus | undefined;
  if (action === "publish") status = ListingStatus.PUBLISHED;
  if (action === "remove") status = ListingStatus.INACTIVE;

  return prisma.marketplaceListing.update({
    where: { id: listingId },
    data: {
      status,
      syncStatus: result.ok ? SyncStatus.IN_SYNC : SyncStatus.FAILED,
      lastSyncedAt: result.syncedAt,
      lastSyncMessage: result.message,
    },
  });
}

export async function createAiListingSuggestion(productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    throw new Error("Product not found");
  }

  return mockListingContentProvider.generateListingContent({
    productName: product.publicName,
    category: product.category,
    shortDescription: product.shortDescription,
    tags: product.tags,
  });
}

export async function getPublishedListingForMarketplace(productId: string, marketplace: MarketplaceType) {
  return prisma.marketplaceListing.findFirst({
    where: {
      productId,
      marketplaceType: marketplace,
      status: ListingStatus.PUBLISHED,
      externalUrl: { not: null },
    },
  });
}

export async function getListingsNeedingReviewCount() {
  return prisma.marketplaceListing.count({
    where: {
      OR: [{ syncStatus: SyncStatus.NEEDS_REVIEW }, { syncStatus: SyncStatus.OUT_OF_SYNC }],
    },
  });
}
