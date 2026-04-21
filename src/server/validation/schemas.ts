import {
  EventProcessingStatus,
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
} from "@/generated/prisma/client";
import { z } from "zod";

const boolLike = z.union([z.literal("true"), z.literal("false")]).transform((value) => value === "true");
const editableProductStatuses = [ProductStatus.ACTIVE, ProductStatus.ARCHIVED] as const;
const editableProductStatusSchema = z.enum(editableProductStatuses);

const optionalNumber = z.preprocess(
  (value) => {
    if (value === "" || value === null || value === undefined) {
      return undefined;
    }

    return Number(value);
  },
  z.number().nonnegative().optional(),
);

const optionalDate = z.preprocess(
  (value) => {
    if (value === "" || value === null || value === undefined) {
      return undefined;
    }

    return new Date(String(value));
  },
  z.date().optional(),
);

export const productFormSchema = z.object({
  internalName: z.string().trim().min(2),
  publicName: z.string().trim().min(2),
  shortDescription: z.string().trim().min(5).max(180),
  fullDescription: z.string().trim().min(10),
  category: z.string().trim().min(2),
  tags: z.string().trim().optional().default(""),
  sku: z.string().trim().min(3),
  status: editableProductStatusSchema,
  isPublic: boolLike,
  isRequestable: boolLike,
  isListable: boolLike,
  inventoryMode: z.nativeEnum(InventoryMode),
  lengthMm: optionalNumber,
  widthMm: optionalNumber,
  heightMm: optionalNumber,
  itemWeightGrams: optionalNumber,
  packagingType: z.string().trim().optional(),
  productionNotes: z.string().trim().optional(),
  printNotes: z.string().trim().optional(),
});

export const productBulkUpdateSchema = z.object({
  productIds: z.array(z.string().trim().min(1)).min(1, "Select at least one product."),
  status: editableProductStatusSchema,
  isPublic: boolLike,
  isRequestable: boolLike,
});

export const productBulkImportSchema = z.object({
  sourceUrls: z.string().trim().min(1, "Paste at least one URL."),
  importImages: boolLike.default(true),
});

export const filamentFormSchema = z.object({
  name: z.string().trim().min(2),
  brand: z.string().trim().optional(),
  colorLabel: z.string().trim().min(2),
  materialType: z.string().trim().min(2),
  notes: z.string().trim().optional(),
  isActive: boolLike,
});

export const productFilamentRequirementSchema = z.object({
  filamentId: z.string().trim().min(1),
  estimatedGramsPerPrint: optionalNumber,
  sortOrder: z.coerce.number().int().nonnegative().default(0),
});

export const listingFormSchema = z.object({
  productId: z.string().trim().min(1),
  marketplaceType: z.nativeEnum(MarketplaceType),
  externalListingId: z.string().trim().optional(),
  title: z.string().trim().min(3),
  description: z.string().trim().min(10),
  tags: z.string().trim().optional().default(""),
  price: z.coerce.number().positive(),
  externalUrl: z.url().optional().or(z.literal("")),
  status: z.nativeEnum(ListingStatus),
  syncStatus: z.nativeEnum(SyncStatus),
});

export const listingBulkProductUpdateSchema = z.object({
  listingIds: z.array(z.string().trim().min(1)).min(1, "Select at least one listing."),
  status: editableProductStatusSchema,
  isPublic: boolLike,
  isRequestable: boolLike,
});

export const requestCreateSchema = z.object({
  productId: z.string().trim().min(1),
  quantity: z.coerce.number().int().min(1).max(50),
  notes: z.string().trim().max(500).optional(),
  requestAsUserId: z
    .preprocess((value) => {
      if (typeof value !== "string") {
        return undefined;
      }

      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }, z.string().min(1).optional()),
});

export const requestUserUpdateSchema = z.object({
  quantity: z.coerce.number().int().min(1).max(50),
  notes: z.string().trim().max(500).optional(),
});

export const requestAdminUpdateSchema = z.object({
  status: z.nativeEnum(RequestStatus),
  adminNotes: z.string().trim().max(1000).optional(),
});

export const requestBulkActionSchema = z
  .object({
    requestIds: z.array(z.string().trim().min(1)).min(1, "Select at least one request."),
    operation: z.enum(["UPDATE", "CONVERT_TO_QUEUE", "DELETE"]),
    status: z.nativeEnum(RequestStatus).optional(),
    adminNotes: z.string().trim().max(1000).optional(),
  })
  .superRefine((value, context) => {
    if (value.operation === "UPDATE" && !value.status) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["status"],
        message: "Select a status for bulk updates.",
      });
    }
  });

export const queueCreateSchema = z.object({
  productId: z.string().trim().min(1),
  sourceType: z.nativeEnum(QueueSourceType),
  sourceReferenceId: z.string().trim().optional(),
  requesterUserId: z.string().trim().optional(),
  quantity: z.coerce.number().int().min(1).max(500),
  status: z.nativeEnum(QueueStatus),
  priority: z.nativeEnum(QueuePriority),
  dueDate: optionalDate,
  notes: z.string().trim().max(1000).optional(),
});

export const queueUpdateSchema = z.object({
  status: z.nativeEnum(QueueStatus),
  priority: z.nativeEnum(QueuePriority),
  notes: z.string().trim().max(1000).optional(),
});

export const userAdminUpdateSchema = z.object({
  role: z.nativeEnum(UserRole),
  isActive: boolLike,
});

export const inventoryUpdateSchema = z.object({
  onHand: z.coerce.number().int().min(-10000).max(100000),
  reserved: z.coerce.number().int().min(0).max(100000),
  committed: z.coerce.number().int().min(0).max(100000),
  reorderThreshold: z.preprocess(
    (value) => {
      if (value === "" || value === null || value === undefined) {
        return undefined;
      }

      return Number(value);
    },
    z.number().int().min(0).max(100000).optional(),
  ),
});

export const settingsSchema = z.object({
  defaultMarketplace: z.nativeEnum(MarketplaceType),
});

export const myMiniFactoryCredentialsSchema = z.object({
  myMiniFactoryClientId: z.string().trim().min(2, "Client ID is required."),
  myMiniFactoryClientSecret: z.string().trim().min(4, "Client secret is required."),
});

export const marketplaceEventSimulationSchema = z.object({
  marketplaceType: z.nativeEnum(MarketplaceType),
  eventType: z.enum(["SALE_OCCURRED", "LISTING_REMOVED", "LISTING_CHANGED_EXTERNALLY"]),
  listingId: z.string().optional(),
  productId: z.string().optional(),
  payloadSummary: z.string().trim().min(4).max(500),
  processingStatus: z.nativeEnum(EventProcessingStatus).default(EventProcessingStatus.PENDING),
});

export const productImportSchema = z.object({
  sourceUrl: z.string().trim().url(),
  importImages: boolLike.default(true),
});
