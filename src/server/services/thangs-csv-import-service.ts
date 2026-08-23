import { ProductImportSource } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { createProduct } from "./product-service";
import { saveImportedImages } from "./product-import-service";

type CsvModel = { creator: string; title: string; referenceId: string; sourceUrl: string; normalizedUrl: string };

function normalizeUrl(value: string) {
  const parsed = new URL(value);
  parsed.hash = "";
  parsed.search = "";
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  return parsed.toString();
}

function cleanImportedThangsTitle(value: string) {
  let title = value.split("|")[0]?.trim() ?? value.trim();
  title = title.replace(/\s*\(\s*No Supports?\s*\/\s*AMS\s*\/\s*Glue\s*\)\s*$/i, "").trim();
  const suffixIndex = title.lastIndexOf(" - ");
  if (suffixIndex >= 0 && /\bkit\s*$/i.test(title.slice(suffixIndex + 3))) {
    title = title.slice(0, suffixIndex).trim();
  }
  return title.replace(/\s+kit\s*$/i, "").trim() || value.trim();
}

function cleanImportedThangsDescription(value: string) {
  const marker = /(?:^|\n)\s*[_*`>\-\s]*want your print to look just like ours\?[\s\S]*$/i;
  return value.replace(marker, "").trim();
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (character === '"' && next === '"') { cell += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") { row.push(cell); cell = ""; }
    else if (character === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += character;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((values) => values.some((value) => value.trim()));
}

export function parseThangsCatalogCsv(text: string): CsvModel[] {
  const [header, ...rows] = parseCsv(text);
  const required = ["creator", "title", "thangs_model_id", "thangs_url"];
  const columns = new Map((header ?? []).map((value, index) => [value.trim().toLowerCase(), index]));
  if (!required.every((column) => columns.has(column))) throw new Error(`CSV must include: ${required.join(", ")}.`);
  const models = rows.map((values, index) => {
    const value = (column: string) => values[columns.get(column) ?? -1]?.trim() ?? "";
    const sourceUrl = value("thangs_url");
    const referenceId = value("thangs_model_id");
    const title = value("title");
    if (!title || !sourceUrl || !/^\d+$/.test(referenceId)) throw new Error(`CSV row ${index + 2} has an invalid title, Thangs URL, or model ID.`);
    const parsed = new URL(sourceUrl);
    if (parsed.hostname !== "thangs.com" || !/^\/designer\/[^/]+\/3d-model\/.+-\d+$/i.test(parsed.pathname)) throw new Error(`CSV row ${index + 2} is not a canonical Thangs model URL.`);
    return { creator: value("creator"), title, referenceId, sourceUrl: normalizeUrl(sourceUrl), normalizedUrl: normalizeUrl(sourceUrl) };
  });
  if (!models.length) throw new Error("CSV has no model rows.");
  if (new Set(models.map((model) => model.referenceId)).size !== models.length) throw new Error("CSV contains duplicate Thangs model IDs.");
  return models;
}

export async function getMissingThangsModelsFromCsv(csv: string) {
  const models = parseThangsCatalogCsv(csv);
  const existing = await prisma.product.findMany({
    where: { importSource: ProductImportSource.THANGS },
    select: { importSourceReferenceId: true, importSourceNormalizedUrl: true },
  });
  const existingIds = new Set(existing.map((product) => product.importSourceReferenceId).filter(Boolean));
  const existingUrls = new Set(existing.map((product) => product.importSourceNormalizedUrl).filter(Boolean));
  return models.filter((model) => !existingIds.has(model.referenceId) && !existingUrls.has(model.normalizedUrl));
}

async function ensureUniqueSku(seed: string) {
  let sku = seed;
  let suffix = 1;
  while (await prisma.product.findUnique({ where: { sku } })) {
    suffix += 1;
    sku = `${seed}-${suffix}`;
  }
  return sku;
}

export async function importMissingThangsProductsFromCsv(input: { csv: string; creatorUrl: string }) {
  const models = parseThangsCatalogCsv(input.csv);
  const creatorUrl = normalizeUrl(input.creatorUrl);
  let created = 0;
  let skipped = 0;

  for (const model of models) {
    const existing = await prisma.product.findFirst({
      where: {
        importSource: ProductImportSource.THANGS,
        OR: [
          { importSourceReferenceId: model.referenceId },
          { importSourceNormalizedUrl: model.normalizedUrl },
        ],
      },
      select: { id: true },
    });
    if (existing) { skipped += 1; continue; }

    const productTitle = cleanImportedThangsTitle(model.title);
    try {
      await createProduct({
        internalName: productTitle,
        publicName: productTitle,
        shortDescription: "Imported from the Kit Kiln catalog CSV. Review source details before publishing.",
        fullDescription: "Imported from a Thangs catalog CSV because source-page enrichment was unavailable. Review the source listing, description, images, and print details before publishing.",
        category: "Imported",
        tags: "",
        sku: await ensureUniqueSku(`THG-${model.referenceId}`),
        status: "DRAFT",
        isPublic: false,
        isRequestable: false,
        isListable: false,
        inventoryMode: "MADE_TO_ORDER",
        productionNotes: `Imported from Thangs catalog CSV.\nOriginal Thangs title: ${model.title}\nImported URL: ${model.sourceUrl}\nSource reference id: ${model.referenceId}\nCreator: ${model.creator || "The Kit Kiln"}\nReview details before publishing.`,
        printNotes: "Catalog-only import. Review dimensions, materials, parts list, and production requirements.",
        importSource: ProductImportSource.THANGS,
        importSourceReferenceId: model.referenceId,
        importSourceUrl: model.sourceUrl,
        importSourceNormalizedUrl: model.normalizedUrl,
        importSourceCreatorName: model.creator || "The Kit Kiln",
        importSourceCreatorUrl: creatorUrl,
      });
      created += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create catalog product.";
      if (message.includes("Unique constraint")) { skipped += 1; continue; }
      throw error;
    }
  }
  return { created, skipped, total: models.length };
}

export async function importEnrichedThangsProductsFromCsv(input: { csv: string; creatorUrl: string }) {
  const [header, ...rows] = parseCsv(input.csv);
  const columns = new Map((header ?? []).map((value, index) => [value.trim().toLowerCase(), index]));
  const required = ["creator", "title", "thangs_model_id", "thangs_url", "short_description", "full_description", "category", "tags", "image_urls_json"];
  if (!required.every((column) => columns.has(column))) throw new Error(`Enriched CSV must include: ${required.join(", ")}.`);
  const toCatalogCsv = [header?.join(",") ?? "", ...rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(","))].join("\n");
  const models = parseThangsCatalogCsv(toCatalogCsv);
  let created = 0; let skipped = 0;
  for (let index = 0; index < models.length; index += 1) {
    const model = models[index]; const row = rows[index];
    const productTitle = cleanImportedThangsTitle(model.title);
    const value = (column: string) => row[columns.get(column) ?? -1]?.trim() ?? "";
    const existing = await prisma.product.findFirst({ where: { importSource: ProductImportSource.THANGS, OR: [{ importSourceReferenceId: model.referenceId }, { importSourceNormalizedUrl: model.normalizedUrl }] }, select: { id: true } });
    if (existing) { skipped += 1; continue; }
    const product = await createProduct({
      internalName: productTitle, publicName: productTitle,
      shortDescription: (cleanImportedThangsDescription(value("short_description")) || productTitle).slice(0, 180),
      fullDescription: cleanImportedThangsDescription(value("full_description")) || cleanImportedThangsDescription(value("short_description")) || productTitle,
      category: value("category") || "Imported", tags: value("tags"), sku: await ensureUniqueSku(`THG-${model.referenceId}`),
      status: "DRAFT", isPublic: false, isRequestable: false, isListable: false, inventoryMode: "MADE_TO_ORDER",
      productionNotes: `Imported from Chrome-enriched Thangs CSV.\nOriginal Thangs title: ${model.title}\nImported URL: ${model.sourceUrl}\nSource reference id: ${model.referenceId}\nCreator: ${model.creator || "The Kit Kiln"}\nReview before publishing.`,
      printNotes: "Review dimensions, images, materials, parts list, and production requirements.",
      importSource: ProductImportSource.THANGS, importSourceReferenceId: model.referenceId, importSourceUrl: model.sourceUrl, importSourceNormalizedUrl: model.normalizedUrl,
      importSourceCreatorName: model.creator || "The Kit Kiln", importSourceCreatorUrl: normalizeUrl(input.creatorUrl),
    });
    try {
      const imageUrls = JSON.parse(value("image_urls_json"));
      if (Array.isArray(imageUrls)) await saveImportedImages(product.id, productTitle, imageUrls.filter((url): url is string => typeof url === "string"));
    } catch {
      // Product metadata remains usable if an individual image URL is invalid or unavailable.
    }
    created += 1;
  }
  return { created, skipped, total: models.length };
}
