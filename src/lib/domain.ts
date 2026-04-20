import {
  InventoryMode,
  ListingStatus,
  MarketplaceType,
  ProductStatus,
  QueuePriority,
  QueueSourceType,
  QueueStatus,
  RequestStatus,
  SyncStatus,
  UserRole,
} from "@/generated/prisma/enums";

export const userRoleLabels: Record<UserRole, string> = {
  ADMIN: "Admin",
  REQUEST_USER: "Request User",
};

export const productStatusOptions = [ProductStatus.ACTIVE, ProductStatus.ARCHIVED] as const;
export const requestStatusOptions = Object.values(RequestStatus);
export const queueStatusOptions = Object.values(QueueStatus);
export const queuePriorityOptions = Object.values(QueuePriority);
export const queueSourceTypeOptions = Object.values(QueueSourceType);
export const inventoryModeOptions = Object.values(InventoryMode);
export const marketplaceTypeOptions = Object.values(MarketplaceType);
export const listingStatusOptions = Object.values(ListingStatus);
export const syncStatusOptions = Object.values(SyncStatus);

export const statusTone: Record<string, string> = {
  DRAFT: "neutral",
  ACTIVE: "success",
  HIDDEN: "warning",
  ARCHIVED: "neutral",
  OUT_OF_STOCK: "danger",
  RETIRED: "neutral",
  PUBLISHED: "success",
  REMOVED: "neutral",
  ERROR: "danger",
  NOT_SYNCED: "neutral",
  IN_SYNC: "success",
  OUT_OF_SYNC: "warning",
  NEEDS_REVIEW: "warning",
  FAILED: "danger",
  SUBMITTED: "info",
  UNDER_REVIEW: "info",
  APPROVED: "success",
  REJECTED: "danger",
  QUEUED: "info",
  COMPLETED: "success",
  CANCELLED: "neutral",
  PENDING: "warning",
  READY_TO_PRINT: "info",
  PRINTING: "info",
  POST_PROCESSING: "info",
  PACKED: "info",
  READY_FOR_PICKUP: "success",
  SHIPPED: "success",
  BLOCKED: "danger",
  PROCESSED: "success",
  LOW: "neutral",
  NORMAL: "info",
  HIGH: "warning",
  URGENT: "danger",
  PRIMARY: "info",
  HEALTHY: "success",
  LOW_STOCK: "warning",
  INACTIVE: "neutral",
};

export function humanizeEnum(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}
