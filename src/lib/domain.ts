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
export const requestStageDefinitions = [
  {
    key: "INTAKE",
    label: "Intake",
    statuses: [RequestStatus.SUBMITTED, RequestStatus.UNDER_REVIEW],
    tone: "info",
  },
  {
    key: "READY",
    label: "Ready",
    statuses: [RequestStatus.APPROVED],
    tone: "success",
  },
  {
    key: "HANDOFF",
    label: "Handoff",
    statuses: [RequestStatus.QUEUED],
    tone: "warning",
  },
  {
    key: "CLOSED_EXCEPTION",
    label: "Closed/Exception",
    statuses: [RequestStatus.COMPLETED, RequestStatus.REJECTED, RequestStatus.CANCELLED],
    tone: "neutral",
  },
] as const;
export type RequestStageKey = (typeof requestStageDefinitions)[number]["key"];
export const requestStageOptions = requestStageDefinitions.map((definition) => definition.key) as RequestStageKey[];
export const queueStatusOptions = Object.values(QueueStatus);
export const queuePriorityOptions = Object.values(QueuePriority);
export const queueSourceTypeOptions = Object.values(QueueSourceType);
export const queueStageDefinitions = [
  {
    key: "INTAKE",
    label: "Intake",
    statuses: [QueueStatus.PENDING],
    tone: "warning",
  },
  {
    key: "PRE_PRODUCTION",
    label: "Pre-Production",
    statuses: [QueueStatus.READY_TO_PRINT],
    tone: "info",
  },
  {
    key: "PRODUCTION",
    label: "Production",
    statuses: [QueueStatus.PRINTING],
    tone: "info",
  },
  {
    key: "FULFILLMENT",
    label: "Fulfillment",
    statuses: [QueueStatus.POST_PROCESSING, QueueStatus.PACKED, QueueStatus.READY_FOR_PICKUP, QueueStatus.SHIPPED],
    tone: "success",
  },
  {
    key: "CLOSED_EXCEPTION",
    label: "Closed/Exception",
    statuses: [QueueStatus.COMPLETED, QueueStatus.CANCELLED, QueueStatus.BLOCKED],
    tone: "neutral",
  },
] as const;
export type QueueStageKey = (typeof queueStageDefinitions)[number]["key"];
export const queueStageOptions = queueStageDefinitions.map((definition) => definition.key) as QueueStageKey[];
export const inventoryModeOptions = Object.values(InventoryMode);
export const marketplaceTypeOptions = Object.values(MarketplaceType);
export const listingStatusOptions = Object.values(ListingStatus);
export const syncStatusOptions = Object.values(SyncStatus);

const queueStatusToStageMap = new Map<QueueStatus, QueueStageKey>(
  queueStageDefinitions.flatMap((definition) => definition.statuses.map((status) => [status, definition.key] as const)),
);
const requestStatusToStageMap = new Map<RequestStatus, RequestStageKey>(
  requestStageDefinitions.flatMap((definition) => definition.statuses.map((status) => [status, definition.key] as const)),
);

export function getQueueStageForStatus(status: QueueStatus): QueueStageKey {
  return queueStatusToStageMap.get(status) ?? "CLOSED_EXCEPTION";
}

export function getRequestStageForStatus(status: RequestStatus): RequestStageKey {
  return requestStatusToStageMap.get(status) ?? "CLOSED_EXCEPTION";
}

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
