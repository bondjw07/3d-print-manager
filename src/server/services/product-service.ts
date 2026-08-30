import { Prisma, type InventoryMode, type ProductImportSource, type ProductStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import { guessFilamentsFromText } from "./filament-matching-service";

function parseTags(tagsInput: string) {
  return tagsInput
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

async function ensureUniqueSlug(baseSlug: string, currentProductId?: string) {
  let slug = baseSlug;
  let suffix = 1;

  while (true) {
    const existing = await prisma.product.findUnique({ where: { slug } });
    if (!existing || existing.id === currentProductId) {
      return slug;
    }

    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }
}

function normalizeCreatorName(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeCreatorUrl(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function resolveManagedCreatorFields(creatorId: string) {
  const creator = await prisma.creator.findUnique({
    where: { id: creatorId },
    select: { name: true, url: true },
  });

  if (!creator) {
    throw new Error("Selected creator was not found.");
  }

  return {
    importSourceCreatorName: creator.name,
    importSourceCreatorUrl: creator.url ?? null,
  };
}

function isUnknownImportIdentityArgumentError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientValidationError)) {
    return false;
  }

  return (
    error.message.includes("Unknown argument `importSource`") ||
    error.message.includes("Unknown argument `importSourceReferenceId`") ||
    error.message.includes("Unknown argument `importSourceNormalizedUrl`") ||
    error.message.includes("Unknown argument `importSourceCreatorUrl`")
  );
}

const detectedFilamentMaterialPattern = /\b(PLA|PETG|ABS|ASA|TPU)\b/i;
const filamentLineValuePatterns = [
  /\bfilaments?\b(?:\s+(?:used|use|required|requirements?|types?|colors?))?\s*[:\-]\s*(.+)$/i,
  /\bfilaments?\b(?:\s+(?:used|use|required|requirements?|types?|colors?))?\s+(?:are|is)\s+(.+)$/i,
];
const markdownLinkPattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi;
const filamentLinkHintPattern = /\b(pla|petg|abs|asa|tpu|filament|matte|silk|metallic|panchroma)\b/i;
const nonFilamentLinkLabelPattern = /\b(website|shop|discord|community|download|instructions?|photos?)\b/i;
const invalidFilamentTokens = new Set(["none", "n/a", "na", "unknown", "various", "multiple"]);

type AutoCreateFilamentCandidate = {
  name: string;
  colorLabel: string;
  materialType: string;
  nameLookupKey: string;
  colorLookupKey: string;
  combinedLookupKey: string;
};

function normalizeFilamentLookupKey(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function extractFilamentLineValue(rawLine: string) {
  const cleaned = rawLine
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`>#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const pattern of filamentLineValuePatterns) {
    const match = cleaned.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function toAutoCreateFilamentCandidate(rawValue: string): AutoCreateFilamentCandidate | null {
  let cleaned = rawValue
    .replace(/\[[^\]]*]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b\d+(?:\.\d+)?\s*(?:g|grams?)\b/gi, " ")
    .replace(/\b(?:approximately|approx|about|around|with|using|use)\b/gi, " ")
    .replace(/[•]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:]+$/g, "")
    .trim();

  if (!cleaned || cleaned.length < 3 || cleaned.length > 80) {
    return null;
  }

  if (!/[a-z]/i.test(cleaned) || /https?:\/\//i.test(cleaned)) {
    return null;
  }

  if (cleaned.split(" ").length > 8 || invalidFilamentTokens.has(cleaned.toLowerCase())) {
    return null;
  }

  cleaned = cleaned.replace(/\b(pla|petg|abs|asa|tpu)\b/gi, (material) => material.toUpperCase());

  const materialType = cleaned.match(detectedFilamentMaterialPattern)?.[1]?.toUpperCase() ?? "PLA";
  const colorLabel =
    cleaned
      .replace(/\b(PLA|PETG|ABS|ASA|TPU)\b/g, " ")
      .replace(/\bfilament\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim() || cleaned;

  const nameLookupKey = normalizeFilamentLookupKey(cleaned);
  const colorLookupKey = normalizeFilamentLookupKey(colorLabel);
  const combinedLookupKey = normalizeFilamentLookupKey(`${cleaned} ${colorLabel}`);

  if (!nameLookupKey || !colorLookupKey) {
    return null;
  }

  return {
    name: cleaned,
    colorLabel,
    materialType,
    nameLookupKey,
    colorLookupKey,
    combinedLookupKey,
  };
}

function extractAutoCreateFilamentCandidates(sourceText: string) {
  const candidates: AutoCreateFilamentCandidate[] = [];
  const seen = new Set<string>();
  const pushCandidate = (rawValue: string) => {
    const candidate = toAutoCreateFilamentCandidate(rawValue);
    if (!candidate || seen.has(candidate.nameLookupKey)) {
      return;
    }

    seen.add(candidate.nameLookupKey);
    candidates.push(candidate);
  };

  for (const line of sourceText.split(/\r?\n/)) {
    const value = extractFilamentLineValue(line);
    if (!value) {
      continue;
    }

    const segments = value
      .split(/,|;|\/|\||\+|\band\b/gi)
      .map((segment) => segment.trim())
      .filter(Boolean);

    for (const segment of segments) {
      pushCandidate(segment);
    }
  }

  for (const match of sourceText.matchAll(markdownLinkPattern)) {
    const linkLabel = match[1]?.trim();
    if (!linkLabel) {
      continue;
    }

    if (nonFilamentLinkLabelPattern.test(linkLabel)) {
      continue;
    }

    if (!filamentLinkHintPattern.test(linkLabel)) {
      continue;
    }

    pushCandidate(linkLabel);
  }

  return candidates;
}

export async function getAdminProducts(search?: string) {
  return prisma.product.findMany({
    where: search
      ? {
          OR: [
            { internalName: { contains: search, mode: "insensitive" } },
            { publicName: { contains: search, mode: "insensitive" } },
            { sku: { contains: search, mode: "insensitive" } },
          ],
        }
      : undefined,
    include: {
      images: { where: { isPrimary: true }, take: 1 },
      listings: true,
      requests: true,
      queueItems: { where: { status: { not: "COMPLETED" } } },
      inventoryRecord: true,
      pricingTier: true,
      filamentRequirements: { include: { filament: true } },
      bambuBuddyFilamentRequirements: { orderBy: { sortOrder: "asc" } },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getPublicProducts(search?: string) {
  return prisma.product.findMany({
    where: {
      isPublic: true,
      status: "ACTIVE",
      ...(search
        ? {
            OR: [
              { publicName: { contains: search, mode: "insensitive" } },
              { shortDescription: { contains: search, mode: "insensitive" } },
              { category: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      images: {
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
        take: 1,
      },
      listings: {
        where: { status: "PUBLISHED" },
      },
      filamentRequirements: {
        include: { filament: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getProductByIdForAdmin(id: string) {
  return prisma.product.findUnique({
    where: { id },
    include: {
      images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] },
      listings: { orderBy: { updatedAt: "desc" } },
      requests: {
        include: { requesterUser: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
      queueItems: { orderBy: { createdAt: "desc" }, take: 10 },
      inventoryRecord: true,
      pricingTier: true,
      filamentRequirements: {
        include: { filament: true },
        orderBy: { sortOrder: "asc" },
      },
      bambuBuddyFilamentRequirements: { orderBy: { sortOrder: "asc" } },
      _count: {
        select: {
          requests: true,
          queueItems: true,
        },
      },
    },
  });
}

export async function getPublicProductBySlug(slug: string) {
  return prisma.product.findUnique({
    where: { slug },
    include: {
      images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] },
      listings: true,
      filamentRequirements: {
        include: { filament: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
}

export async function createProduct(data: {
  internalName: string;
  publicName: string;
  shortDescription: string;
  fullDescription: string;
  category: string;
  pricingTierId?: string | null;
  tags: string;
  sku: string;
  status: ProductStatus;
  isPublic: boolean;
  isRequestable: boolean;
  isListable: boolean;
  inventoryMode: InventoryMode;
  lengthMm?: number;
  widthMm?: number;
  heightMm?: number;
  itemWeightGrams?: number;
  packagingType?: string;
  bambuBuddyFileId?: string;
  productionNotes?: string;
  printNotes?: string;
  importSource?: ProductImportSource;
  importSourceReferenceId?: string;
  importSourceUrl?: string;
  importSourceNormalizedUrl?: string;
  creatorId?: string | null;
  importSourceCreatorName?: string;
  importSourceCreatorUrl?: string;
}) {
  const baseSlug = slugify(data.publicName);
  const slug = await ensureUniqueSlug(baseSlug);
  let importSourceCreatorName = normalizeCreatorName(data.importSourceCreatorName) ?? undefined;
  let importSourceCreatorUrl = normalizeCreatorUrl(data.importSourceCreatorUrl) ?? undefined;

  if (typeof data.creatorId === "string") {
    const managedCreator = await resolveManagedCreatorFields(data.creatorId);
    importSourceCreatorName = managedCreator.importSourceCreatorName;
    importSourceCreatorUrl = managedCreator.importSourceCreatorUrl ?? undefined;
  } else if (data.creatorId === null) {
    importSourceCreatorName = undefined;
    importSourceCreatorUrl = undefined;
  }

  const baseCreateData = {
    slug,
    internalName: data.internalName,
    publicName: data.publicName,
    shortDescription: data.shortDescription,
    fullDescription: data.fullDescription,
    category: data.category,
    pricingTierId: data.pricingTierId,
    tags: parseTags(data.tags),
    sku: data.sku,
    status: data.status,
    isPublic: data.isPublic,
    isRequestable: data.isRequestable,
    isListable: data.isListable,
    inventoryMode: data.inventoryMode,
    lengthMm: data.lengthMm,
    widthMm: data.widthMm,
    heightMm: data.heightMm,
    itemWeightGrams: data.itemWeightGrams,
    packagingType: data.packagingType,
    bambuBuddyFileId: data.bambuBuddyFileId?.trim() || undefined,
    productionNotes: data.productionNotes,
    printNotes: data.printNotes,
    inventoryRecord: {
      create: {
        onHand: 0,
        reserved: 0,
        committed: 0,
        available: 0,
      },
    },
  };

  try {
    const product = await prisma.product.create({
      data: {
        ...baseCreateData,
        importSource: data.importSource,
        importSourceReferenceId: data.importSourceReferenceId,
        importSourceUrl: data.importSourceUrl,
        importSourceNormalizedUrl: data.importSourceNormalizedUrl,
        importSourceCreatorName,
        importSourceCreatorUrl,
      },
    });

    return product;
  } catch (error) {
    if (!isUnknownImportIdentityArgumentError(error)) {
      throw error;
    }

    return prisma.product.create({
      data: baseCreateData,
    });
  }
}

export async function updateProduct(
  productId: string,
  data: {
    internalName: string;
    publicName: string;
    shortDescription: string;
    fullDescription: string;
    category: string;
    pricingTierId: string | null;
    tags: string;
    sku: string;
    status: ProductStatus;
    isPublic: boolean;
    isRequestable: boolean;
    isListable: boolean;
    inventoryMode: InventoryMode;
    lengthMm?: number;
    widthMm?: number;
    heightMm?: number;
    itemWeightGrams?: number;
    packagingType?: string;
    bambuBuddyFileId?: string;
    productionNotes?: string;
    printNotes?: string;
    creatorId?: string | null;
    importSourceCreatorName?: string;
    importSourceCreatorUrl?: string;
  },
) {
  const baseSlug = slugify(data.publicName);
  const slug = await ensureUniqueSlug(baseSlug, productId);
  const creatorUpdate: Prisma.ProductUncheckedUpdateInput = {};

  if (typeof data.creatorId === "string") {
    const managedCreator = await resolveManagedCreatorFields(data.creatorId);
    creatorUpdate.importSourceCreatorName = managedCreator.importSourceCreatorName;
    creatorUpdate.importSourceCreatorUrl = managedCreator.importSourceCreatorUrl;
  } else if (data.creatorId === null) {
    creatorUpdate.importSourceCreatorName = null;
    creatorUpdate.importSourceCreatorUrl = null;
  } else if (data.importSourceCreatorName !== undefined || data.importSourceCreatorUrl !== undefined) {
    creatorUpdate.importSourceCreatorName = normalizeCreatorName(data.importSourceCreatorName);
    creatorUpdate.importSourceCreatorUrl = normalizeCreatorUrl(data.importSourceCreatorUrl);
  }

  return prisma.product.update({
    where: { id: productId },
    data: {
      slug,
      internalName: data.internalName,
      publicName: data.publicName,
      shortDescription: data.shortDescription,
      fullDescription: data.fullDescription,
      category: data.category,
      pricingTierId: data.pricingTierId,
      tags: parseTags(data.tags),
      sku: data.sku,
      status: data.status,
      isPublic: data.isPublic,
      isRequestable: data.isRequestable,
      isListable: data.isListable,
      inventoryMode: data.inventoryMode,
      lengthMm: data.lengthMm,
      widthMm: data.widthMm,
      heightMm: data.heightMm,
      itemWeightGrams: data.itemWeightGrams,
      packagingType: data.packagingType,
      bambuBuddyFileId: data.bambuBuddyFileId?.trim() || null,
      productionNotes: data.productionNotes,
      printNotes: data.printNotes,
      ...creatorUpdate,
    },
  });
}

export async function updateBambuBuddyProductData(input: {
  productId: string;
  fileId: string;
  printTimeSeconds?: number;
  filamentUsedGrams?: number;
  filamentRequirements: Array<{ materialType: string; hexColor: string; estimatedGramsPerPrint: number }>;
}) {
  return prisma.$transaction(async (transaction) => {
    await transaction.productBambuBuddyFilamentRequirement.deleteMany({ where: { productId: input.productId } });
    if (input.filamentRequirements.length > 0) {
      await transaction.productBambuBuddyFilamentRequirement.createMany({
        data: input.filamentRequirements.map((requirement, sortOrder) => ({ ...requirement, productId: input.productId, sortOrder })),
      });
    }
    return transaction.product.update({
      where: { id: input.productId },
      data: {
        bambuBuddyFileId: input.fileId,
        bambuBuddyPrintTimeSeconds: input.printTimeSeconds,
        bambuBuddyFilamentUsedGrams: input.filamentUsedGrams,
        bambuBuddyLastSyncedAt: new Date(),
      },
    });
  });
}

export async function setProductStatus(productId: string, status: ProductStatus) {
  return prisma.product.update({ where: { id: productId }, data: { status } });
}

export async function bulkUpdateProductControls(input: {
  productIds: string[];
  status?: ProductStatus;
  isPublic?: boolean;
  isRequestable?: boolean;
  category?: string;
  pricingTierId?: string;
  tagsToAdd?: string;
  creatorSelection?: string;
}) {
  const uniqueProductIds = Array.from(new Set(input.productIds));
  if (uniqueProductIds.length === 0) {
    return 0;
  }

  const data: Prisma.ProductUncheckedUpdateManyInput = {};
  if (input.status !== undefined) {
    data.status = input.status;
  }
  if (input.isPublic !== undefined) {
    data.isPublic = input.isPublic;
  }
  if (input.isRequestable !== undefined) {
    data.isRequestable = input.isRequestable;
  }
  if (input.category !== undefined) {
    data.category = input.category;
  }
  if (input.pricingTierId !== undefined) {
    data.pricingTierId = input.pricingTierId;
  }

  const creatorSelection = input.creatorSelection?.trim();
  if (creatorSelection && creatorSelection !== "UNCHANGED") {
    if (creatorSelection === "CLEAR") {
      data.importSourceCreatorName = null;
      data.importSourceCreatorUrl = null;
    } else {
      const managedCreator = await resolveManagedCreatorFields(creatorSelection);
      data.importSourceCreatorName = managedCreator.importSourceCreatorName;
      data.importSourceCreatorUrl = managedCreator.importSourceCreatorUrl;
    }
  }

  const normalizedTagsToAdd = Array.from(
    new Map(
      parseTags(input.tagsToAdd ?? "").map((tag) => [tag.toLocaleLowerCase(), tag]),
    ).values(),
  );

  if (Object.keys(data).length === 0 && normalizedTagsToAdd.length === 0) {
    return 0;
  }

  await prisma.$transaction(async (transaction) => {
    if (Object.keys(data).length > 0) {
      await transaction.product.updateMany({ where: { id: { in: uniqueProductIds } }, data });
    }

    if (normalizedTagsToAdd.length > 0) {
      const products = await transaction.product.findMany({
        where: { id: { in: uniqueProductIds } },
        select: { id: true, tags: true },
      });
      await Promise.all(products.map((product) => {
        const existingTagKeys = new Set(product.tags.map((tag) => tag.toLocaleLowerCase()));
        const tags = [...product.tags, ...normalizedTagsToAdd.filter((tag) => !existingTagKeys.has(tag.toLocaleLowerCase()))];
        return transaction.product.update({ where: { id: product.id }, data: { tags } });
      }));
    }
  });

  return uniqueProductIds.length;
}

export async function addFilamentRequirement(input: {
  productId: string;
  filamentId: string;
  estimatedGramsPerPrint?: number;
}) {
  const currentCount = await prisma.productFilamentRequirement.count({
    where: { productId: input.productId },
  });

  return prisma.productFilamentRequirement.upsert({
    where: {
      productId_filamentId: {
        productId: input.productId,
        filamentId: input.filamentId,
      },
    },
    create: {
      productId: input.productId,
      filamentId: input.filamentId,
      estimatedGramsPerPrint: input.estimatedGramsPerPrint,
      sortOrder: currentCount,
    },
    update: {
      estimatedGramsPerPrint: input.estimatedGramsPerPrint,
    },
  });
}

export async function guessAndApplyFilamentRequirements(input: {
  productId: string;
  sourceText?: string;
  createMissingFilaments?: boolean;
}) {
  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    select: {
      id: true,
      internalName: true,
      publicName: true,
      shortDescription: true,
      fullDescription: true,
      productionNotes: true,
      printNotes: true,
      filamentRequirements: {
        select: {
          filamentId: true,
        },
      },
    },
  });

  if (!product) {
    throw new Error("Product not found.");
  }

  const sourceText =
    input.sourceText ??
    [
      product.publicName,
      product.internalName,
      product.shortDescription,
      product.fullDescription,
      product.productionNotes,
      product.printNotes,
    ]
      .filter(Boolean)
      .join("\n");

  const guessedMatches = await guessFilamentsFromText(sourceText, { includeInactive: false, limit: 24 });
  const targetFilamentIds = new Set(guessedMatches.map((match) => match.filamentId));
  let createdFilamentCount = 0;
  let autoDetectedFilamentCount = 0;

  if (input.createMissingFilaments) {
    const autoCreateCandidates = extractAutoCreateFilamentCandidates(sourceText);
    autoDetectedFilamentCount = autoCreateCandidates.length;

    if (autoCreateCandidates.length > 0) {
      const knownFilaments = await prisma.filament.findMany({
        select: {
          id: true,
          name: true,
          colorLabel: true,
        },
        orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
      });

      const filamentIdByLookupKey = new Map<string, string>();
      const registerFilament = (filament: { id: string; name: string; colorLabel: string }) => {
        for (const key of [
          normalizeFilamentLookupKey(filament.name),
          normalizeFilamentLookupKey(filament.colorLabel),
          normalizeFilamentLookupKey(`${filament.name} ${filament.colorLabel}`),
        ]) {
          if (key && !filamentIdByLookupKey.has(key)) {
            filamentIdByLookupKey.set(key, filament.id);
          }
        }
      };

      for (const filament of knownFilaments) {
        registerFilament(filament);
      }

      for (const candidate of autoCreateCandidates) {
        const existingFilamentId =
          filamentIdByLookupKey.get(candidate.nameLookupKey) ??
          filamentIdByLookupKey.get(candidate.colorLookupKey) ??
          filamentIdByLookupKey.get(candidate.combinedLookupKey);

        if (existingFilamentId) {
          targetFilamentIds.add(existingFilamentId);
          continue;
        }

        const createdFilament = await prisma.filament.create({
          data: {
            name: candidate.name,
            colorLabel: candidate.colorLabel,
            materialType: candidate.materialType,
            isActive: true,
            notes: "Auto-created from Thangs import filament metadata. Review and update if needed.",
          },
          select: {
            id: true,
            name: true,
            colorLabel: true,
          },
        });

        registerFilament(createdFilament);
        targetFilamentIds.add(createdFilament.id);
        createdFilamentCount += 1;
      }
    }
  }

  if (targetFilamentIds.size === 0) {
    return {
      matchedCount: guessedMatches.length,
      addedCount: 0,
      alreadyAssignedCount: 0,
      createdFilamentCount,
      autoDetectedFilamentCount,
      matches: guessedMatches,
    };
  }

  const existingFilamentIds = new Set(product.filamentRequirements.map((requirement) => requirement.filamentId));
  const currentCount = await prisma.productFilamentRequirement.count({
    where: { productId: product.id },
  });

  let addedCount = 0;
  let alreadyAssignedCount = 0;

  for (const filamentId of targetFilamentIds) {
    if (existingFilamentIds.has(filamentId)) {
      alreadyAssignedCount += 1;
      continue;
    }

    try {
      await prisma.productFilamentRequirement.create({
        data: {
          productId: product.id,
          filamentId,
          sortOrder: currentCount + addedCount,
        },
      });
      existingFilamentIds.add(filamentId);
      addedCount += 1;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        alreadyAssignedCount += 1;
        continue;
      }
      throw error;
    }
  }

  return {
    matchedCount: guessedMatches.length,
    addedCount,
    alreadyAssignedCount,
    createdFilamentCount,
    autoDetectedFilamentCount,
    matches: guessedMatches,
  };
}

export async function removeFilamentRequirement(requirementId: string) {
  return prisma.productFilamentRequirement.delete({ where: { id: requirementId } });
}

export async function reorderFilamentRequirement(requirementId: string, sortOrder: number) {
  return prisma.productFilamentRequirement.update({
    where: { id: requirementId },
    data: { sortOrder },
  });
}

export async function setPrimaryProductImage(productId: string, imageId: string) {
  await prisma.productImage.updateMany({
    where: { productId },
    data: { isPrimary: false },
  });

  return prisma.productImage.update({
    where: { id: imageId },
    data: { isPrimary: true },
  });
}

export async function deleteProductImage(imageId: string) {
  return prisma.productImage.delete({ where: { id: imageId } });
}

export async function deleteProduct(productId: string, options?: { force?: boolean }) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      images: {
        select: {
          imagePath: true,
        },
      },
      _count: {
        select: {
          requests: true,
          queueItems: true,
        },
      },
    },
  });

  if (!product) {
    throw new Error("Product not found.");
  }

  const requestCount = product._count.requests;
  const queueCount = product._count.queueItems;
  const hasLinkedWork = requestCount > 0 || queueCount > 0;

  if (hasLinkedWork && !options?.force) {
    throw new Error(
      `This product has ${requestCount} request(s) and ${queueCount} queue item(s). Type "delete" to remove linked records and delete the product.`,
    );
  }

  let deletedQueueCount = 0;
  let deletedRequestCount = 0;

  await prisma.$transaction(async (tx) => {
    if (hasLinkedWork) {
      const deletedQueue = await tx.queueItem.deleteMany({
        where: { productId },
      });
      deletedQueueCount = deletedQueue.count;

      const deletedRequests = await tx.request.deleteMany({
        where: { productId },
      });
      deletedRequestCount = deletedRequests.count;
    }

    await tx.product.delete({
      where: { id: productId },
    });
  });

  return {
    deletedImagePaths: product.images.map((image) => image.imagePath),
    deletedQueueCount,
    deletedRequestCount,
  };
}

export async function deleteAllProducts() {
  const products = await prisma.product.findMany({
    select: {
      images: {
        select: {
          imagePath: true,
        },
      },
    },
  });

  let deletedQueueCount = 0;
  let deletedRequestCount = 0;
  let deletedProductCount = 0;

  await prisma.$transaction(async (tx) => {
    const deletedQueue = await tx.queueItem.deleteMany({});
    deletedQueueCount = deletedQueue.count;

    const deletedRequests = await tx.request.deleteMany({});
    deletedRequestCount = deletedRequests.count;

    const deletedProducts = await tx.product.deleteMany({});
    deletedProductCount = deletedProducts.count;
  });

  return {
    deletedImagePaths: products.flatMap((product) => product.images.map((image) => image.imagePath)),
    deletedQueueCount,
    deletedRequestCount,
    deletedProductCount,
  };
}
