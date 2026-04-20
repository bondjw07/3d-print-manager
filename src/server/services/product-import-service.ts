import { Prisma, type Product, type ProductImportSource } from "@/generated/prisma/client";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { localProductImageStorage } from "@/server/storage/local-storage-service";
import { resolveProductImporter } from "@/server/importers/provider";
import type { ImportedProductData } from "@/server/importers/types";
import { createProduct, guessAndApplyFilamentRequirements } from "./product-service";

const supportedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/svg+xml"]);

type DownloadedImage = {
  file: File;
  contentHash: string;
};

type SaveImportedImagesResult = {
  savedCount: number;
  skippedDuplicateCount: number;
};

function truncate(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 3)).trim()}...`;
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeImportedSourceUrl(sourceUrl: string) {
  try {
    const parsed = new URL(sourceUrl);
    parsed.hash = "";
    parsed.search = "";

    const normalizedPath = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${normalizedPath}`;
  } catch {
    return sourceUrl.trim();
  }
}

function asDbImportSource(source: ImportedProductData["source"]): ProductImportSource {
  return source as ProductImportSource;
}

function bufferHash(value: ArrayBuffer | Uint8Array | Buffer) {
  const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : value;
  return createHash("sha256").update(bytes).digest("hex");
}

function normalizeImportedImageUrl(imageUrl: string) {
  try {
    const parsed = new URL(imageUrl);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return imageUrl.trim();
  }
}

function buildSourceSkuSeed(imported: ImportedProductData) {
  const sourcePrefix =
    imported.source === "THANGS"
      ? "THG"
      : imported.source === "LOOT_STUDIOS"
        ? "LST"
        : "MMF";

  const ref = imported.sourceReferenceId?.replace(/[^a-z0-9]/gi, "").slice(0, 10) || "IMPORT";
  return `${sourcePrefix}-${ref}`.toUpperCase();
}

async function ensureUniqueSku(seed: string) {
  let candidate = seed;
  let suffix = 0;

  while (true) {
    const existing = await prisma.product.findUnique({ where: { sku: candidate } });
    if (!existing) {
      return candidate;
    }

    suffix += 1;
    candidate = `${seed}-${suffix}`;
  }
}

function fileNameFromUrl(sourceUrl: string, fallbackBase: string, contentType: string) {
  try {
    const parsed = new URL(sourceUrl);
    const name = parsed.pathname.split("/").pop() || fallbackBase;
    const decoded = decodeURIComponent(name).replace(/\s+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "");
    if (decoded.includes(".")) {
      return decoded;
    }
  } catch {
    // fall through
  }

  if (contentType === "image/jpeg") return `${fallbackBase}.jpg`;
  if (contentType === "image/png") return `${fallbackBase}.png`;
  if (contentType === "image/webp") return `${fallbackBase}.webp`;
  if (contentType === "image/svg+xml") return `${fallbackBase}.svg`;
  return `${fallbackBase}.img`;
}

function inferContentTypeFromUrl(imageUrl: string) {
  const lower = imageUrl.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return null;
}

function inferContentTypeFromBytes(bytes: Uint8Array) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  const maybeText = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 256)).trimStart().toLowerCase();
  if (maybeText.startsWith("<svg") || maybeText.startsWith("<?xml")) {
    return "image/svg+xml";
  }

  return null;
}

async function downloadImageAsFile(imageUrl: string, index: number): Promise<DownloadedImage | null> {
  const response = await fetch(imageUrl, {
    method: "GET",
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    return null;
  }

  const rawType = response.headers.get("content-type") ?? "";
  const headerType = rawType.split(";")[0]?.toLowerCase() || "";
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength) {
    return null;
  }

  let contentType = headerType;
  if (!supportedImageTypes.has(contentType)) {
    const bytesView = new Uint8Array(bytes);
    contentType = inferContentTypeFromUrl(imageUrl) || inferContentTypeFromBytes(bytesView) || "";
  }

  if (!supportedImageTypes.has(contentType)) {
    return null;
  }

  const fileName = fileNameFromUrl(imageUrl, `imported-image-${index + 1}`, contentType);
  return {
    file: new File([bytes], fileName, { type: contentType }),
    contentHash: bufferHash(bytes),
  };
}

async function getExistingProductImageHashes(productId: string) {
  const hashes = new Set<string>();
  const existingImages = await prisma.productImage.findMany({
    where: { productId },
    select: { imagePath: true },
  });

  await Promise.all(
    existingImages.map(async (image) => {
      if (!image.imagePath.startsWith("/uploads/products/")) {
        return;
      }

      try {
        const fullPath = path.join(process.cwd(), "public", image.imagePath);
        const bytes = await readFile(fullPath);
        hashes.add(bufferHash(bytes));
      } catch {
        // Skip images that are no longer present on disk.
      }
    }),
  );

  return hashes;
}

async function saveImportedImages(productId: string, title: string, imageUrls: string[]): Promise<SaveImportedImagesResult> {
  let savedCount = 0;
  let skippedDuplicateCount = 0;
  const existingHashes = await getExistingProductImageHashes(productId);
  const startingImageCount = await prisma.productImage.count({ where: { productId } });
  const uniqueUrls = Array.from(new Set(imageUrls.map((url) => normalizeImportedImageUrl(url)))).slice(0, 24);

  for (let index = 0; index < uniqueUrls.length; index += 1) {
    const downloaded = await downloadImageAsFile(uniqueUrls[index], index);
    if (!downloaded) {
      continue;
    }

    if (existingHashes.has(downloaded.contentHash)) {
      skippedDuplicateCount += 1;
      continue;
    }

    try {
      const { imagePath } = await localProductImageStorage.saveProductImage(downloaded.file);

      await prisma.productImage.create({
        data: {
          productId,
          imagePath,
          altText: `${title} image ${startingImageCount + savedCount + 1}`,
          sortOrder: startingImageCount + savedCount,
          isPrimary: startingImageCount === 0 && savedCount === 0,
        },
      });

      existingHashes.add(downloaded.contentHash);
      savedCount += 1;
    } catch {
      // Skip images that fail validation or persistence.
    }
  }

  return {
    savedCount,
    skippedDuplicateCount,
  };
}

function buildProductionNotes(imported: ImportedProductData) {
  const lines = [
    `Imported source: ${imported.source}`,
    `Imported URL: ${imported.sourceUrl}`,
    imported.sourceReferenceId ? `Source reference id: ${imported.sourceReferenceId}` : null,
    imported.creatorName ? `Creator: ${imported.creatorName}` : null,
    `Fetch mode: ${imported.fetchMode}`,
    "Review licensing terms and print settings before publishing.",
  ].filter(Boolean);

  return lines.join("\n");
}

function buildFilamentGuessSourceText(imported: ImportedProductData) {
  return [
    imported.title,
    imported.shortDescription,
    imported.fullDescription,
    imported.tags.join(", "),
    imported.creatorName ? `Creator: ${imported.creatorName}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function backfillImportIdentity(
  product: Product,
  imported: ImportedProductData,
  normalizedSourceUrl: string,
) {
  const dbSource = asDbImportSource(imported.source);

  if (
    product.importSource === dbSource &&
    product.importSourceReferenceId === (imported.sourceReferenceId ?? null) &&
    product.importSourceNormalizedUrl === normalizedSourceUrl
  ) {
    return product;
  }

  try {
    return await prisma.product.update({
      where: { id: product.id },
      data: {
        importSource: dbSource,
        importSourceReferenceId: imported.sourceReferenceId ?? null,
        importSourceUrl: imported.sourceUrl,
        importSourceNormalizedUrl: normalizedSourceUrl,
        importSourceCreatorName: imported.creatorName ?? null,
      },
    });
  } catch (error) {
    if (isUnknownImportIdentityArgumentError(error)) {
      return product;
    }

    if (!isKnownUniqueConstraintError(error)) {
      throw error;
    }

    if (imported.sourceReferenceId) {
      const existingByReference = await prisma.product.findFirst({
        where: {
          importSource: dbSource,
          importSourceReferenceId: imported.sourceReferenceId,
        },
      });
      if (existingByReference) {
        return existingByReference;
      }
    }

    const existingByUrl = await prisma.product.findFirst({
      where: {
        importSource: dbSource,
        importSourceNormalizedUrl: normalizedSourceUrl,
      },
    });

    return existingByUrl ?? product;
  }
}

async function findExistingImportedProduct(imported: ImportedProductData, normalizedSourceUrl: string) {
  const dbSource = asDbImportSource(imported.source);

  try {
    if (imported.sourceReferenceId) {
      const existingByReference = await prisma.product.findFirst({
        where: {
          importSource: dbSource,
          importSourceReferenceId: imported.sourceReferenceId,
        },
      });
      if (existingByReference) {
        return existingByReference;
      }
    }

    const existingByUrl = await prisma.product.findFirst({
      where: {
        importSource: dbSource,
        importSourceNormalizedUrl: normalizedSourceUrl,
      },
    });
    if (existingByUrl) {
      return existingByUrl;
    }
  } catch (error) {
    if (!isUnknownImportIdentityArgumentError(error)) {
      throw error;
    }
  }

  if (imported.sourceReferenceId) {
    const legacyByReference = await prisma.product.findFirst({
      where: {
        AND: [
          { productionNotes: { contains: `Imported source: ${imported.source}` } },
          { productionNotes: { contains: `Source reference id: ${imported.sourceReferenceId}` } },
        ],
      },
    });
    if (legacyByReference) {
      return backfillImportIdentity(legacyByReference, imported, normalizedSourceUrl);
    }
  }

  const legacyByUrl = await prisma.product.findFirst({
    where: {
      AND: [
        { productionNotes: { contains: `Imported source: ${imported.source}` } },
        { productionNotes: { contains: `Imported URL: ${imported.sourceUrl}` } },
      ],
    },
  });

  if (legacyByUrl) {
    return backfillImportIdentity(legacyByUrl, imported, normalizedSourceUrl);
  }

  return null;
}

function isKnownUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
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

function mapImportToProductDraft(imported: ImportedProductData, sku: string, normalizedSourceUrl: string) {
  const fullDescriptionRaw = cleanText(imported.fullDescription || imported.shortDescription || imported.title);
  const shortDescriptionRaw = cleanText(imported.shortDescription || fullDescriptionRaw || imported.title);
  const category = cleanText(imported.category || "Imported");
  const tags = imported.tags.slice(0, 24).join(", ");

  return {
    internalName: imported.title,
    publicName: imported.title,
    shortDescription: truncate(shortDescriptionRaw || imported.title, 180),
    fullDescription: truncate(fullDescriptionRaw || imported.title, 4000),
    category,
    tags,
    sku,
    status: "ACTIVE" as const,
    isPublic: false,
    isRequestable: false,
    isListable: true,
    inventoryMode: "MADE_TO_ORDER" as const,
    productionNotes: buildProductionNotes(imported),
    printNotes: "Imported item. Review dimensions, parts list, and production requirements.",
    importSource: asDbImportSource(imported.source),
    importSourceReferenceId: imported.sourceReferenceId,
    importSourceUrl: imported.sourceUrl,
    importSourceNormalizedUrl: normalizedSourceUrl,
    importSourceCreatorName: imported.creatorName,
  };
}

function mapImportToProductUpdate(imported: ImportedProductData, normalizedSourceUrl: string) {
  const fullDescriptionRaw = cleanText(imported.fullDescription || imported.shortDescription || imported.title);
  const shortDescriptionRaw = cleanText(imported.shortDescription || fullDescriptionRaw || imported.title);
  const category = cleanText(imported.category || "Imported");

  return {
    internalName: imported.title,
    publicName: imported.title,
    shortDescription: truncate(shortDescriptionRaw || imported.title, 180),
    fullDescription: truncate(fullDescriptionRaw || imported.title, 4000),
    category,
    tags: imported.tags.slice(0, 24),
    productionNotes: buildProductionNotes(imported),
    importSource: asDbImportSource(imported.source),
    importSourceReferenceId: imported.sourceReferenceId ?? null,
    importSourceUrl: imported.sourceUrl,
    importSourceNormalizedUrl: normalizedSourceUrl,
    importSourceCreatorName: imported.creatorName ?? null,
  };
}

async function updateExistingProductFromImport(productId: string, imported: ImportedProductData, normalizedSourceUrl: string) {
  const updateData = mapImportToProductUpdate(imported, normalizedSourceUrl);

  try {
    return await prisma.product.update({
      where: { id: productId },
      data: updateData,
    });
  } catch (error) {
    if (!isUnknownImportIdentityArgumentError(error)) {
      throw error;
    }

    return prisma.product.update({
      where: { id: productId },
      data: {
        internalName: updateData.internalName,
        publicName: updateData.publicName,
        shortDescription: updateData.shortDescription,
        fullDescription: updateData.fullDescription,
        category: updateData.category,
        tags: updateData.tags,
        productionNotes: updateData.productionNotes,
      },
    });
  }
}

export async function importProductFromSourceUrl(input: { sourceUrl: string; importImages: boolean }): Promise<{
  product: Product;
  importedImageCount: number;
  skippedDuplicateImageCount: number;
  source: string;
  wasDuplicate: boolean;
  guessedFilamentCount: number;
  addedFilamentRequirementCount: number;
}> {
  const importer = resolveProductImporter(input.sourceUrl);
  if (!importer) {
    throw new Error("No importer available for this URL yet. Supported today: Thangs and MyMiniFactory.");
  }

  const imported = await importer.importFromUrl(input.sourceUrl);
  const normalizedSourceUrl = normalizeImportedSourceUrl(imported.sourceUrl);

  const existingProduct = await findExistingImportedProduct(imported, normalizedSourceUrl);
  if (existingProduct) {
    return {
      product: existingProduct,
      importedImageCount: 0,
      skippedDuplicateImageCount: 0,
      source: imported.source,
      wasDuplicate: true,
      guessedFilamentCount: 0,
      addedFilamentRequirementCount: 0,
    };
  }

  const sku = await ensureUniqueSku(buildSourceSkuSeed(imported));
  const draft = mapImportToProductDraft(imported, sku, normalizedSourceUrl);

  let product: Product;
  try {
    product = await createProduct(draft);
  } catch (error) {
    if (!isKnownUniqueConstraintError(error)) {
      throw error;
    }

    const duplicateAfterRace = await findExistingImportedProduct(imported, normalizedSourceUrl);
    if (!duplicateAfterRace) {
      throw error;
    }

    return {
      product: duplicateAfterRace,
      importedImageCount: 0,
      skippedDuplicateImageCount: 0,
      source: imported.source,
      wasDuplicate: true,
      guessedFilamentCount: 0,
      addedFilamentRequirementCount: 0,
    };
  }

  const imageResult =
    input.importImages && imported.imageUrls.length > 0
      ? await saveImportedImages(product.id, imported.title, imported.imageUrls)
      : { savedCount: 0, skippedDuplicateCount: 0 };

  const filamentGuessResult = await guessAndApplyFilamentRequirements({
    productId: product.id,
    sourceText: buildFilamentGuessSourceText(imported),
  });

  return {
    product,
    importedImageCount: imageResult.savedCount,
    skippedDuplicateImageCount: imageResult.skippedDuplicateCount,
    source: imported.source,
    wasDuplicate: false,
    guessedFilamentCount: filamentGuessResult.matchedCount,
    addedFilamentRequirementCount: filamentGuessResult.addedCount,
  };
}

export async function refreshProductFromSourceUrl(input: {
  productId: string;
  sourceUrl: string;
  importImages: boolean;
}): Promise<{
  product: Product;
  importedImageCount: number;
  skippedDuplicateImageCount: number;
  source: string;
  guessedFilamentCount: number;
  addedFilamentRequirementCount: number;
}> {
  const existingProduct = await prisma.product.findUnique({
    where: { id: input.productId },
    select: { id: true },
  });

  if (!existingProduct) {
    throw new Error("Product not found.");
  }

  const importer = resolveProductImporter(input.sourceUrl);
  if (!importer) {
    throw new Error("No importer available for this URL yet. Supported today: Thangs and MyMiniFactory.");
  }

  const imported = await importer.importFromUrl(input.sourceUrl);
  const normalizedSourceUrl = normalizeImportedSourceUrl(imported.sourceUrl);
  const duplicateProduct = await findExistingImportedProduct(imported, normalizedSourceUrl);

  if (duplicateProduct && duplicateProduct.id !== input.productId) {
    throw new Error("This source already belongs to another product. Update that product instead.");
  }

  const product = await updateExistingProductFromImport(input.productId, imported, normalizedSourceUrl);
  const imageResult =
    input.importImages && imported.imageUrls.length > 0
      ? await saveImportedImages(product.id, imported.title, imported.imageUrls)
      : { savedCount: 0, skippedDuplicateCount: 0 };
  const filamentGuessResult = await guessAndApplyFilamentRequirements({
    productId: product.id,
    sourceText: buildFilamentGuessSourceText(imported),
  });

  return {
    product,
    importedImageCount: imageResult.savedCount,
    skippedDuplicateImageCount: imageResult.skippedDuplicateCount,
    source: imported.source,
    guessedFilamentCount: filamentGuessResult.matchedCount,
    addedFilamentRequirementCount: filamentGuessResult.addedCount,
  };
}
