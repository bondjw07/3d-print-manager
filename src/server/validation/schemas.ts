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
import {
  baselineGramsPerHourOptions,
  complexityMultiplierOptions,
  fixedHoursPerPrintOptions,
  printerUtilizationRateOptions,
} from "@/lib/processing-time-estimates";
import { DEFAULT_SCALE_PERCENT } from "@/lib/request-scale";
import { z } from "zod";

const boolLike = z.union([z.literal("true"), z.literal("false")]).transform((value) => value === "true");
const boolLikeOrUnchanged = z
  .union([z.literal("UNCHANGED"), z.literal("true"), z.literal("false")])
  .transform((value) => (value === "UNCHANGED" ? undefined : value === "true"));
const editableProductStatuses = [ProductStatus.ACTIVE, ProductStatus.ARCHIVED] as const;
const editableProductStatusSchema = z.enum(editableProductStatuses);
const editableProductStatusOrUnchangedSchema = z
  .union([z.literal("UNCHANGED"), editableProductStatusSchema])
  .transform((value) => (value === "UNCHANGED" ? undefined : value));

const productFormCreatorSelection = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return undefined;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    if (trimmed === "__UNCHANGED__") {
      return undefined;
    }

    return trimmed;
  },
  z.string().min(1).nullable().optional(),
);

const pricingTierSelection = z.preprocess(
  (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
  z.string().min(1).nullable(),
);

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

const requiredModelScalePercent = z.coerce.number().min(10).max(400);
const optionalModelScalePercent = z.preprocess(
  (value) => {
    if (value === "" || value === null || value === undefined) {
      return undefined;
    }

    return Number(value);
  },
  z.number().min(10).max(400).optional(),
);

const optionalFilamentScalePercent = z.preprocess(
  (value) => {
    if (value === "" || value === null || value === undefined) {
      return undefined;
    }

    return Number(value);
  },
  z.number().min(1).max(400).optional(),
);

export const productFormSchema = z.object({
  internalName: z.string().trim().min(2),
  publicName: z.string().trim().min(2),
  shortDescription: z.string().trim().min(5).max(180),
  fullDescription: z.string().trim().min(10),
  category: z.string().trim().min(2),
  pricingTierId: pricingTierSelection,
  tags: z.string().trim().optional().default(""),
  creatorId: productFormCreatorSelection,
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

export const productBulkUpdateSchema = z
  .object({
    productIds: z.array(z.string().trim().min(1)).min(1, "Select at least one product."),
    status: editableProductStatusOrUnchangedSchema,
    isPublic: boolLikeOrUnchanged,
    isRequestable: boolLikeOrUnchanged,
    category: z.string().trim().default("UNCHANGED"),
    pricingTierId: z.string().trim().default("UNCHANGED"),
    tagsToAdd: z.string().trim().max(500).optional().default(""),
    creatorSelection: z.preprocess(
      (value) => {
        if (typeof value !== "string") {
          return "UNCHANGED";
        }

        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : "UNCHANGED";
      },
      z.string().min(1),
    ),
  })
  .superRefine((value, context) => {
    const hasControlChange =
      value.status !== undefined || value.isPublic !== undefined || value.isRequestable !== undefined || value.category !== "UNCHANGED" || value.pricingTierId !== "UNCHANGED" || Boolean(value.tagsToAdd);
    const hasCreatorChange = value.creatorSelection !== "UNCHANGED";

    if (!hasControlChange && !hasCreatorChange) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["status"],
        message: "Choose at least one field to update.",
      });
    }
  });

export const productBulkImportSchema = z.object({
  sourceUrls: z.string().trim().min(1, "Paste at least one URL."),
  importImages: boolLike.default(true),
});

export const managedCreatorSchema = z.object({
  name: z.string().trim().min(2).max(160),
  url: z.url().optional().or(z.literal("")),
});

export const managedCreatorDeleteSchema = z.object({
  creatorId: z.string().trim().min(1),
});

export const filamentFormSchema = z.object({
  name: z.string().trim().min(2),
  brand: z.string().trim().optional(),
  colorLabel: z.string().trim().min(2),
  materialType: z.string().trim().min(2),
  spoolCostPerKg: z.coerce.number().min(0).max(1000),
  notes: z.string().trim().optional(),
  isActive: boolLike,
});

export const filamentStockUpdateSchema = z.object({
  fullRollCount: z.coerce.number().int().min(0).max(500),
  partialRollGrams: z.array(z.coerce.number().positive().max(5000)).max(100).default([]),
});

export const filamentBulkCostUpdateSchema = z.object({
  filamentIds: z.array(z.string().trim().min(1)).min(1, "Select at least one filament."),
  spoolCostPerKg: z.coerce.number().min(0).max(1000),
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

export const bulkShopifyListingSchema = z.object({
  productId: z.string().trim().min(1),
  price: z.coerce.number().positive(),
  categoryTag: z.string().trim().optional().default(""),
  imageIds: z.array(z.string().trim().min(1)).default([]),
  primaryImageId: z.string().trim().optional().default(""),
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
  modelScalePercent: requiredModelScalePercent.default(DEFAULT_SCALE_PERCENT),
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
  modelScalePercent: requiredModelScalePercent.default(DEFAULT_SCALE_PERCENT),
  notes: z.string().trim().max(500).optional(),
});

export const requestAdminUpdateSchema = z.object({
  status: z.nativeEnum(RequestStatus),
  modelScalePercent: optionalModelScalePercent,
  filamentScalePercent: optionalFilamentScalePercent,
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

export const inventoryStockAddSchema = z.object({
  quantity: z.coerce.number().int().min(1).max(100000),
  printedScalePercent: z.coerce.number().min(10).max(400).default(DEFAULT_SCALE_PERCENT),
});

export const settingsSchema = z.object({
  defaultMarketplace: z.nativeEnum(MarketplaceType),
});

export const productCategoriesSchema = z.object({
  categories: z.string().max(5000),
});

export const pricingTierCreateSchema = z.object({
  category: z.string().trim().min(2),
  label: z.string().trim().min(2).max(80),
  suggestedPrice: z.coerce.number().positive().max(100000),
});

export const pricingTierUpdateSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(2).max(80),
  suggestedPrice: z.coerce.number().positive().max(100000),
});

export const pricingTierDeleteSchema = z.object({ id: z.string().trim().min(1) });

const printerUtilizationRateValues = printerUtilizationRateOptions.map((option) => option.value.toString()) as [
  string,
  ...string[],
];
const baselineGramsPerHourValues = baselineGramsPerHourOptions.map((option) => option.value.toString()) as [
  string,
  ...string[],
];
const complexityMultiplierValues = complexityMultiplierOptions.map((option) => option.value.toString()) as [
  string,
  ...string[],
];
const fixedHoursPerPrintValues = fixedHoursPerPrintOptions.map((option) => option.value.toString()) as [
  string,
  ...string[],
];

export const processingEstimateSettingsSchema = z.object({
  printerCount: z.coerce.number().int().min(1).max(24),
  printerUtilizationRate: z.enum(printerUtilizationRateValues).transform((value) => Number(value)),
  baselineGramsPerHour: z.enum(baselineGramsPerHourValues).transform((value) => Number(value)),
  complexityMultiplier: z.enum(complexityMultiplierValues).transform((value) => Number(value)),
  fixedHoursPerPrint: z.enum(fixedHoursPerPrintValues).transform((value) => Number(value)),
});

export const myMiniFactoryCredentialsSchema = z.object({
  myMiniFactoryClientId: z.string().trim().min(2, "Client ID is required."),
  myMiniFactoryClientSecret: z.string().trim().min(4, "Client secret is required."),
});

const shopifyShopDomainSchema = z.preprocess(
  (value) =>
    typeof value === "string"
      ? value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "")
      : value,
  z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/, "Enter a Shopify domain like your-store.myshopify.com."),
);

export const shopifyCredentialsSchema = z.object({
  shopifyShopDomain: shopifyShopDomainSchema,
  shopifyClientId: z.string().trim().min(2, "Shopify client ID is required."),
  shopifyClientSecret: z.string().trim().min(4, "Shopify client secret is required."),
});

export const publicAppUrlSchema = z.object({
  publicAppUrl: z
    .url("Enter a valid URL.")
    .refine((value) => value.startsWith("https://"), "Use a public HTTPS URL.")
    .transform((value) => value.replace(/\/$/, "")),
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
