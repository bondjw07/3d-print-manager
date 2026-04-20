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

function isUnknownImportIdentityArgumentError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientValidationError)) {
    return false;
  }

  return (
    error.message.includes("Unknown argument `importSource`") ||
    error.message.includes("Unknown argument `importSourceReferenceId`") ||
    error.message.includes("Unknown argument `importSourceNormalizedUrl`")
  );
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
      filamentRequirements: {
        include: { filament: true },
        orderBy: { sortOrder: "asc" },
      },
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
  productionNotes?: string;
  printNotes?: string;
  importSource?: ProductImportSource;
  importSourceReferenceId?: string;
  importSourceUrl?: string;
  importSourceNormalizedUrl?: string;
  importSourceCreatorName?: string;
}) {
  const baseSlug = slugify(data.publicName);
  const slug = await ensureUniqueSlug(baseSlug);

  const baseCreateData = {
    slug,
    internalName: data.internalName,
    publicName: data.publicName,
    shortDescription: data.shortDescription,
    fullDescription: data.fullDescription,
    category: data.category,
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
        importSourceCreatorName: data.importSourceCreatorName,
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
    productionNotes?: string;
    printNotes?: string;
  },
) {
  const baseSlug = slugify(data.publicName);
  const slug = await ensureUniqueSlug(baseSlug, productId);

  return prisma.product.update({
    where: { id: productId },
    data: {
      slug,
      internalName: data.internalName,
      publicName: data.publicName,
      shortDescription: data.shortDescription,
      fullDescription: data.fullDescription,
      category: data.category,
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
      productionNotes: data.productionNotes,
      printNotes: data.printNotes,
    },
  });
}

export async function setProductStatus(productId: string, status: ProductStatus) {
  return prisma.product.update({ where: { id: productId }, data: { status } });
}

export async function bulkUpdateProductControls(input: {
  productIds: string[];
  status: ProductStatus;
  isPublic: boolean;
  isRequestable: boolean;
}) {
  const uniqueProductIds = Array.from(new Set(input.productIds));
  if (uniqueProductIds.length === 0) {
    return 0;
  }

  const result = await prisma.product.updateMany({
    where: {
      id: { in: uniqueProductIds },
    },
    data: {
      status: input.status,
      isPublic: input.isPublic,
      isRequestable: input.isRequestable,
    },
  });

  return result.count;
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
  if (guessedMatches.length === 0) {
    return {
      matchedCount: 0,
      addedCount: 0,
      alreadyAssignedCount: 0,
      matches: guessedMatches,
    };
  }

  const existingFilamentIds = new Set(product.filamentRequirements.map((requirement) => requirement.filamentId));
  const currentCount = await prisma.productFilamentRequirement.count({
    where: { productId: product.id },
  });

  let addedCount = 0;
  let alreadyAssignedCount = 0;

  for (const match of guessedMatches) {
    if (existingFilamentIds.has(match.filamentId)) {
      alreadyAssignedCount += 1;
      continue;
    }

    try {
      await prisma.productFilamentRequirement.create({
        data: {
          productId: product.id,
          filamentId: match.filamentId,
          sortOrder: currentCount + addedCount,
        },
      });
      existingFilamentIds.add(match.filamentId);
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
