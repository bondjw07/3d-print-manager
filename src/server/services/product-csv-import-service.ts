import { Prisma, ProductImportSource } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeMyMiniFactoryObjectUrl } from "@/server/importers/myminifactory-importer";
import { localProductImageStorage } from "@/server/storage/local-storage-service";
import { createProduct } from "./product-service";

type ParsedHeader = {
  headerRowIndex: number;
  columns: {
    name: number | null;
    url: number;
    images: number;
    creatorName: number | null;
    creatorUrl: number | null;
    description: number | null;
    originalId: number;
  };
};

type ParsedCsvRow = {
  csvRowIndex: number;
  name: string;
  url: string;
  images: string;
  creatorName: string;
  creatorUrl: string;
  description: string;
  originalId: string;
};

type SaveImportedImagesResult = {
  savedCount: number;
  skippedCount: number;
};

export type ProductCsvImportResult = {
  totalRows: number;
  importedCount: number;
  duplicateCount: number;
  invalidCount: number;
  failedCount: number;
  importedImageCount: number;
  skippedImageCount: number;
  warnings: string[];
};

const MAX_WARNING_MESSAGES = 50;
const MAX_DESCRIPTION_LENGTH = 4000;
const MAX_SHORT_DESCRIPTION_LENGTH = 180;
const MAX_IMAGES_PER_ROW = 24;
const supportedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/svg+xml"]);

function truncate(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 3)).trim()}...`;
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeHeaderCell(value: string) {
  return cleanText(
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " "),
  );
}

function parseCsvRows(content: string) {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];

    if (character === '"') {
      if (inQuotes && content[index + 1] === '"') {
        currentField += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      currentRow.push(currentField);
      currentField = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && content[index + 1] === "\n") {
        index += 1;
      }

      currentRow.push(currentField);
      currentField = "";

      if (currentRow.some((value) => cleanText(value).length > 0)) {
        rows.push(currentRow);
      }

      currentRow = [];
      continue;
    }

    currentField += character;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some((value) => cleanText(value).length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

function resolveHeader(rows: string[][]): ParsedHeader {
  const aliases: Record<keyof ParsedHeader["columns"], readonly string[]> = {
    name: ["name", "title", "object name", "product name"],
    url: ["url", "source url", "object url", "product url", "link"],
    images: ["images", "image urls", "image list", "all images", "additional images", "preview url", "previewurl"],
    creatorName: ["creator", "creator name", "creatorname", "designer", "author"],
    creatorUrl: ["creator url", "creatorurl", "creator profile", "creator profile url"],
    description: ["description", "desc", "full description", "details"],
    originalId: ["original id", "originalid", "object id", "objectid", "id"],
  };

  for (let headerRowIndex = 0; headerRowIndex < rows.length; headerRowIndex += 1) {
    const normalizedHeader = rows[headerRowIndex].map((value) => normalizeHeaderCell(value));

    const columnIndexes = {
      name: normalizedHeader.findIndex((value) => aliases.name.includes(value)),
      url: normalizedHeader.findIndex((value) => aliases.url.includes(value)),
      images: normalizedHeader.findIndex((value) => aliases.images.includes(value)),
      creatorName: normalizedHeader.findIndex((value) => aliases.creatorName.includes(value)),
      creatorUrl: normalizedHeader.findIndex((value) => aliases.creatorUrl.includes(value)),
      description: normalizedHeader.findIndex((value) => aliases.description.includes(value)),
      originalId: normalizedHeader.findIndex((value) => aliases.originalId.includes(value)),
    };

    if (columnIndexes.url >= 0 && columnIndexes.images >= 0 && columnIndexes.originalId >= 0) {
      return {
        headerRowIndex,
        columns: {
          name: columnIndexes.name >= 0 ? columnIndexes.name : null,
          url: columnIndexes.url,
          images: columnIndexes.images,
          creatorName: columnIndexes.creatorName >= 0 ? columnIndexes.creatorName : null,
          creatorUrl: columnIndexes.creatorUrl >= 0 ? columnIndexes.creatorUrl : null,
          description: columnIndexes.description >= 0 ? columnIndexes.description : null,
          originalId: columnIndexes.originalId,
        },
      };
    }
  }

  throw new Error('CSV header not found. Expected "url", "images", and "originalId" columns.');
}

function parseCsvDataRows(content: string): ParsedCsvRow[] {
  const rows = parseCsvRows(content);
  if (rows.length < 2) {
    throw new Error("CSV does not include enough rows to import.");
  }

  const { headerRowIndex, columns } = resolveHeader(rows);
  const parsedRows: ParsedCsvRow[] = [];

  for (let csvRowIndex = headerRowIndex + 1; csvRowIndex < rows.length; csvRowIndex += 1) {
    const row = rows[csvRowIndex];
    const rawName = columns.name === null ? "" : row[columns.name] ?? "";
    const rawUrl = row[columns.url] ?? "";
    const rawImages = row[columns.images] ?? "";
    const rawCreatorName = columns.creatorName === null ? "" : row[columns.creatorName] ?? "";
    const rawCreatorUrl = columns.creatorUrl === null ? "" : row[columns.creatorUrl] ?? "";
    const rawDescription = columns.description === null ? "" : row[columns.description] ?? "";
    const rawOriginalId = row[columns.originalId] ?? "";

    const hasAnyValue =
      cleanText(rawName).length > 0 ||
      cleanText(rawUrl).length > 0 ||
      cleanText(rawImages).length > 0 ||
      cleanText(rawCreatorName).length > 0 ||
      cleanText(rawDescription).length > 0;

    if (!hasAnyValue) {
      continue;
    }

    parsedRows.push({
      csvRowIndex,
      name: cleanText(rawName),
      url: cleanText(rawUrl),
      images: rawImages.trim(),
      creatorName: cleanText(rawCreatorName),
      creatorUrl: cleanText(rawCreatorUrl),
      description: rawDescription.trim(),
      originalId: cleanText(rawOriginalId),
    });
  }

  return parsedRows;
}

function addWarning(target: string[], message: string) {
  if (target.length < MAX_WARNING_MESSAGES) {
    target.push(message);
  }
}

function objectIdFromValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const direct = trimmed.match(/^\d+$/)?.[0];
  if (direct) {
    return direct;
  }

  const fromObjectPrefix = trimmed.match(/object-(\d+)/i)?.[1];
  if (fromObjectPrefix) {
    return fromObjectPrefix;
  }

  const fromSlug = trimmed.match(/-(\d+)(?:$|[/?#])/i)?.[1];
  if (fromSlug) {
    return fromSlug;
  }

  return null;
}

function deriveNameFromUrl(url: string, objectId: string) {
  try {
    const parsed = new URL(url);
    const segment = parsed.pathname.split("/").filter(Boolean).pop() || "";
    const withoutId = segment.replace(/-\d+$/, "").replace(/^3d-print-/, "").replace(/-/g, " ");
    const normalized = cleanText(withoutId);
    if (normalized.length >= 2) {
      return normalized;
    }
  } catch {
    // Fall back to default name below.
  }

  return `MMF Object ${objectId}`;
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

async function skuExists(sku: string) {
  const existing = await prisma.product.findUnique({
    where: { sku },
    select: { id: true },
  });
  return Boolean(existing);
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

function fileNameFromUrl(sourceUrl: string, fallbackBase: string, contentType: string) {
  try {
    const parsed = new URL(sourceUrl);
    const name = parsed.pathname.split("/").pop() || fallbackBase;
    const decoded = decodeURIComponent(name).replace(/\s+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "");
    if (decoded.includes(".")) {
      return decoded;
    }
  } catch {
    // Fall through to fallback extension.
  }

  if (contentType === "image/jpeg") return `${fallbackBase}.jpg`;
  if (contentType === "image/png") return `${fallbackBase}.png`;
  if (contentType === "image/webp") return `${fallbackBase}.webp`;
  if (contentType === "image/svg+xml") return `${fallbackBase}.svg`;
  return `${fallbackBase}.img`;
}

async function downloadImageAsFile(imageUrl: string, index: number): Promise<File | null> {
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
  return new File([bytes], fileName, { type: contentType });
}

function parseImageList(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((value) => cleanText(String(value))).filter(Boolean);
      }
    } catch {
      // Fall through to delimiter-based parsing.
    }
  }

  return trimmed
    .split(/\r?\n|\|/g)
    .map((value) => cleanText(value))
    .filter(Boolean);
}

function normalizeImageUrls(input: { images: string }) {
  const unique = new Set<string>();
  const values = parseImageList(input.images);

  for (const candidate of values) {
    if (!candidate) {
      continue;
    }

    try {
      const normalized = normalizeImportedImageUrl(new URL(candidate).toString());
      if (normalized) {
        unique.add(normalized);
      }
    } catch {
      // Ignore invalid image URLs.
    }
  }

  return Array.from(unique).slice(0, MAX_IMAGES_PER_ROW);
}

async function saveImportedImages(productId: string, title: string, imageUrls: string[]): Promise<SaveImportedImagesResult> {
  let savedCount = 0;
  let skippedCount = 0;

  const startingImageCount = await prisma.productImage.count({ where: { productId } });

  for (let index = 0; index < imageUrls.length; index += 1) {
    const downloaded = await downloadImageAsFile(imageUrls[index], index);
    if (!downloaded) {
      skippedCount += 1;
      continue;
    }

    try {
      const { imagePath } = await localProductImageStorage.saveProductImage(downloaded);

      await prisma.productImage.create({
        data: {
          productId,
          imagePath,
          altText: `${title} image ${startingImageCount + savedCount + 1}`,
          sortOrder: startingImageCount + savedCount,
          isPrimary: startingImageCount === 0 && savedCount === 0,
        },
      });

      savedCount += 1;
    } catch {
      skippedCount += 1;
    }
  }

  return {
    savedCount,
    skippedCount,
  };
}

function buildProductionNotes(input: {
  sourceUrl: string;
  objectId: string;
  creatorName?: string;
  creatorUrl?: string;
}) {
  const lines = [
    `Imported source: MY_MINI_FACTORY`,
    `Imported URL: ${input.sourceUrl}`,
    `Source reference id: ${input.objectId}`,
    input.creatorName ? `Creator: ${input.creatorName}` : null,
    input.creatorUrl ? `Creator URL: ${input.creatorUrl}` : null,
    "Fetch mode: CSV",
    "Review licensing terms and print settings before publishing.",
  ].filter(Boolean);

  return lines.join("\n");
}

function isKnownUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function findExistingProduct(objectId: string, normalizedSourceUrl: string) {
  const existingByReference = await prisma.product.findFirst({
    where: {
      importSource: ProductImportSource.MY_MINI_FACTORY,
      importSourceReferenceId: objectId,
    },
    select: { id: true },
  });

  if (existingByReference) {
    return existingByReference;
  }

  return prisma.product.findFirst({
    where: {
      importSource: ProductImportSource.MY_MINI_FACTORY,
      importSourceNormalizedUrl: normalizedSourceUrl,
    },
    select: { id: true },
  });
}

export async function importProductsFromCsv(
  csvContent: string,
  input: { importImages: boolean },
): Promise<ProductCsvImportResult> {
  const parsedRows = parseCsvDataRows(csvContent);
  if (parsedRows.length === 0) {
    throw new Error("No data rows found after the CSV header.");
  }

  const warnings: string[] = [];
  let importedCount = 0;
  let duplicateCount = 0;
  let invalidCount = 0;
  let failedCount = 0;
  let importedImageCount = 0;
  let skippedImageCount = 0;

  for (const row of parsedRows) {
    const sourceUrl = normalizeMyMiniFactoryObjectUrl(row.url);
    if (!sourceUrl) {
      invalidCount += 1;
      addWarning(warnings, `Row ${row.csvRowIndex + 1}: invalid MyMiniFactory object URL.`);
      continue;
    }

    const normalizedSourceUrl = normalizeImportedSourceUrl(sourceUrl);
    const objectId = objectIdFromValue(row.originalId);
    if (!objectId) {
      invalidCount += 1;
      addWarning(warnings, `Row ${row.csvRowIndex + 1}: invalid originalId.`);
      continue;
    }

    const creatorName = row.creatorName || undefined;
    const creatorUrl = row.creatorUrl || undefined;

    const name = cleanText(row.name) || deriveNameFromUrl(sourceUrl, objectId);
    if (name.length < 2) {
      invalidCount += 1;
      addWarning(warnings, `Row ${row.csvRowIndex + 1}: name is too short.`);
      continue;
    }

    const description = cleanText(row.description || name);
    const shortDescription = truncate(description || name, MAX_SHORT_DESCRIPTION_LENGTH);
    const fullDescription = truncate(description || name, MAX_DESCRIPTION_LENGTH);

    const sku = `MMF-${objectId}`;
    if (await skuExists(sku)) {
      duplicateCount += 1;
      continue;
    }

    const existing = await findExistingProduct(objectId, normalizedSourceUrl);
    if (existing) {
      duplicateCount += 1;
      continue;
    }

    try {
      const product = await createProduct({
        internalName: name,
        publicName: name,
        shortDescription,
        fullDescription,
        category: "Imported",
        tags: "",
        sku,
        status: "ACTIVE",
        isPublic: false,
        isRequestable: false,
        isListable: true,
        inventoryMode: "MADE_TO_ORDER",
        productionNotes: buildProductionNotes({
          sourceUrl,
          objectId,
          creatorName,
          creatorUrl,
        }),
        printNotes: "Imported item from CSV. Review dimensions, parts list, and production requirements.",
        importSource: ProductImportSource.MY_MINI_FACTORY,
        importSourceReferenceId: objectId,
        importSourceUrl: sourceUrl,
        importSourceNormalizedUrl: normalizedSourceUrl,
        importSourceCreatorName: creatorName,
        importSourceCreatorUrl: creatorUrl,
      });

      importedCount += 1;

      if (input.importImages) {
        const imageUrls = normalizeImageUrls({ images: row.images });
        if (imageUrls.length > 0) {
          const imageResult = await saveImportedImages(product.id, name, imageUrls);
          importedImageCount += imageResult.savedCount;
          skippedImageCount += imageResult.skippedCount;
        }
      }
    } catch (error) {
      if (isKnownUniqueConstraintError(error)) {
        duplicateCount += 1;
        continue;
      }

      failedCount += 1;
      const message = error instanceof Error ? error.message : "Import failed.";
      addWarning(warnings, `Row ${row.csvRowIndex + 1}: ${message}`);
    }
  }

  return {
    totalRows: parsedRows.length,
    importedCount,
    duplicateCount,
    invalidCount,
    failedCount,
    importedImageCount,
    skippedImageCount,
    warnings,
  };
}
