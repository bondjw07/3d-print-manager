import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type ParsedCsvDataset = {
  headerRowIndex: number;
  modelNameIndex: number;
  totalWeightIndex: number;
  sourceUrlIndex: number | null;
  filamentColumns: Array<{
    index: number;
    csvFilamentName: string;
  }>;
  rows: string[][];
};

type ParsedCsvRow = {
  csvRowIndex: number;
  csvModelName: string;
  csvTotalWeightGrams: number | null;
  sourceUrl: string | null;
  filamentValues: Array<{
    csvFilamentName: string;
    grams: number;
  }>;
};

type MatchConfidence = "HIGH" | "MEDIUM" | "LOW";

export type CsvFilamentWeightPreviewResult = {
  headerRowIndex: number;
  rows: CsvFilamentWeightPreviewRow[];
  summary: {
    totalRows: number;
    matchedRows: number;
    unmatchedRows: number;
    conflictedRows: number;
    totalFilamentValues: number;
    matchedFilamentValues: number;
    unmatchedFilamentValues: number;
    applyableRows: number;
  };
};

export type CsvFilamentWeightPreviewRow = {
  rowKey: string;
  csvRowIndex: number;
  csvModelName: string;
  csvTotalWeightGrams: number | null;
  matchedProduct:
    | {
        id: string;
        publicName: string;
        internalName: string;
        score: number;
        confidence: MatchConfidence;
      }
    | null;
  filamentMatches: Array<{
    csvFilamentName: string;
    grams: number;
    matchedFilament:
      | {
          id: string;
          name: string;
          colorLabel: string;
          score: number;
          confidence: MatchConfidence;
        }
      | null;
  }>;
  unmatchedFilamentCount: number;
  hasProductConflict: boolean;
  canApply: boolean;
  warnings: string[];
};

export type CsvFilamentWeightApplyRowInput = {
  rowKey: string;
  csvRowIndex: number;
  csvModelName: string;
  productId: string;
  totalWeightGrams: number | null;
  filamentAssignments: Array<{
    filamentId: string;
    csvFilamentName: string;
    grams: number;
  }>;
};

export type CsvFilamentWeightApplyResult = {
  processedRows: number;
  productsTouched: number;
  productWeightUpdates: number;
  filamentRequirementCreates: number;
  filamentRequirementUpdates: number;
};

type ProductCandidate = {
  id: string;
  publicName: string;
  internalName: string;
  importSourceNormalizedUrl: string | null;
  normalizedNames: string[];
};

type FilamentCandidate = {
  id: string;
  name: string;
  colorLabel: string;
  normalizedTerms: string[];
};

function isUnknownImportSourceFieldError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientValidationError)) {
    return false;
  }

  return (
    error.message.includes("Unknown field `importSourceNormalizedUrl`") ||
    error.message.includes("Unknown argument `importSourceNormalizedUrl`")
  );
}

async function getProductsForCsvPreview() {
  try {
    return await prisma.product.findMany({
      select: {
        id: true,
        publicName: true,
        internalName: true,
        importSourceNormalizedUrl: true,
      },
      orderBy: [{ updatedAt: "desc" }],
    });
  } catch (error) {
    if (!isUnknownImportSourceFieldError(error)) {
      throw error;
    }

    const fallbackProducts = await prisma.product.findMany({
      select: {
        id: true,
        publicName: true,
        internalName: true,
      },
      orderBy: [{ updatedAt: "desc" }],
    });

    return fallbackProducts.map((product) => ({
      ...product,
      importSourceNormalizedUrl: null,
    }));
  }
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeText(value: string) {
  return normalizeWhitespace(
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[’'`]/g, "")
      .replace(/[^a-z0-9]+/g, " "),
  );
}

const modelNoiseTokens = new Set([
  "no",
  "ams",
  "support",
  "supports",
  "supportless",
  "glue",
  "kit",
  "the",
  "print",
  "model",
  "stl",
]);

const filamentNoiseTokens = new Set([
  "polymaker",
  "panchroma",
  "matte",
  "silk",
  "polyterra",
  "filament",
  "pla",
  "petg",
  "abs",
  "asa",
  "tpu",
]);

function stripNoiseTokens(value: string, noiseTokens: Set<string>) {
  const tokens = normalizeText(value)
    .split(" ")
    .filter(Boolean)
    .filter((token) => !noiseTokens.has(token));
  return normalizeWhitespace(tokens.join(" "));
}

function toTokenSet(value: string) {
  const tokens = normalizeText(value)
    .split(" ")
    .filter((token) => token.length >= 2);
  return new Set(tokens);
}

function jaccardSimilarity(left: Set<string>, right: Set<string>) {
  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }

  if (intersection === 0) {
    return 0;
  }

  return intersection / (left.size + right.size - intersection);
}

function toBigrams(value: string) {
  const normalized = ` ${normalizeText(value)} `;
  const bigrams: string[] = [];
  for (let index = 0; index < normalized.length - 1; index += 1) {
    bigrams.push(normalized.slice(index, index + 2));
  }
  return bigrams;
}

function diceCoefficient(left: string, right: string) {
  const leftBigrams = toBigrams(left);
  const rightBigrams = toBigrams(right);

  if (leftBigrams.length === 0 || rightBigrams.length === 0) {
    return 0;
  }

  const rightCounts = new Map<string, number>();
  for (const bigram of rightBigrams) {
    rightCounts.set(bigram, (rightCounts.get(bigram) ?? 0) + 1);
  }

  let overlap = 0;
  for (const bigram of leftBigrams) {
    const count = rightCounts.get(bigram) ?? 0;
    if (count > 0) {
      overlap += 1;
      rightCounts.set(bigram, count - 1);
    }
  }

  return (2 * overlap) / (leftBigrams.length + rightBigrams.length);
}

function calculateSimilarityScore(leftRaw: string, rightRaw: string) {
  const left = normalizeText(leftRaw);
  const right = normalizeText(rightRaw);

  if (!left || !right) {
    return 0;
  }

  if (left === right) {
    return 1;
  }

  const lengthGap = Math.abs(left.length - right.length) / Math.max(left.length, right.length);
  const containsScore =
    left.includes(right) || right.includes(left)
      ? Math.max(0.7, 0.96 - lengthGap * 0.3)
      : 0;

  const prefixScore =
    left.startsWith(right) || right.startsWith(left)
      ? Math.max(0.65, 0.9 - lengthGap * 0.35)
      : 0;

  const tokenScore = jaccardSimilarity(toTokenSet(left), toTokenSet(right));
  const diceScore = diceCoefficient(left, right);
  const blendedScore = tokenScore * 0.55 + diceScore * 0.45;

  return Math.max(containsScore, prefixScore, blendedScore);
}

function normalizeImportedSourceUrl(sourceUrl: string) {
  try {
    const parsed = new URL(sourceUrl);
    parsed.hash = "";
    parsed.search = "";
    const normalizedPath = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${normalizedPath}`;
  } catch {
    return normalizeWhitespace(sourceUrl);
  }
}

function parsePositiveNumber(rawValue: string | undefined) {
  if (!rawValue) {
    return null;
  }

  const numeric = Number(rawValue.replace(/,/g, "").trim());
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  return Math.round(numeric * 100) / 100;
}

function cleanFilamentHeaderName(headerValue: string) {
  return normalizeWhitespace(headerValue.replace(/\bweight\s*\(g\)\b/gi, "").replace(/\n/g, " "));
}

function parseCsvRows(content: string) {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];

    if (character === "\"") {
      if (inQuotes && content[index + 1] === "\"") {
        currentField += "\"";
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
      if (currentRow.some((value) => value.trim().length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      continue;
    }

    currentField += character;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some((value) => value.trim().length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

function parseCsvDataset(content: string): ParsedCsvDataset {
  const rows = parseCsvRows(content);
  if (rows.length < 2) {
    throw new Error("CSV does not include enough rows to parse.");
  }

  const headerRowIndex = rows.findIndex((row) => row.some((value) => normalizeText(value) === "model name"));
  if (headerRowIndex < 0) {
    throw new Error('CSV header row not found. Expected a "Model Name" column.');
  }

  const header = rows[headerRowIndex];
  const normalizedHeader = header.map((value) => normalizeText(value));
  const modelNameIndex = normalizedHeader.findIndex((value) => value === "model name");
  const totalWeightIndex = normalizedHeader.findIndex(
    (value) => value === "total weight g" || value.startsWith("total weight"),
  );

  if (modelNameIndex < 0) {
    throw new Error("Unable to parse Model Name column.");
  }
  if (totalWeightIndex < 0) {
    throw new Error("Unable to parse Total Weight (g) column.");
  }

  const sourceUrlIndex = normalizedHeader.findIndex((value) => /(source|model|product).*(url|link)|\burl\b/.test(value));
  const filamentColumns = header
    .map((headerValue, index) => {
      if (index === modelNameIndex || index === totalWeightIndex) {
        return null;
      }

      const normalized = normalizeText(headerValue);
      if (!normalized.includes("weight g")) {
        return null;
      }
      if (normalized.startsWith("total weight")) {
        return null;
      }

      const csvFilamentName = cleanFilamentHeaderName(headerValue);
      if (!csvFilamentName) {
        return null;
      }

      return {
        index,
        csvFilamentName,
      };
    })
    .filter((value): value is { index: number; csvFilamentName: string } => value !== null);

  if (filamentColumns.length === 0) {
    throw new Error('No filament columns were found. Expected columns such as "Color Name / Weight (g)".');
  }

  return {
    headerRowIndex,
    modelNameIndex,
    totalWeightIndex,
    sourceUrlIndex: sourceUrlIndex >= 0 ? sourceUrlIndex : null,
    filamentColumns,
    rows,
  };
}

function parseCsvDataRows(dataset: ParsedCsvDataset) {
  const dataRows: ParsedCsvRow[] = [];

  for (let csvRowIndex = dataset.headerRowIndex + 1; csvRowIndex < dataset.rows.length; csvRowIndex += 1) {
    const row = dataset.rows[csvRowIndex];
    const csvModelName = normalizeWhitespace(row[dataset.modelNameIndex] ?? "");
    if (!csvModelName) {
      continue;
    }

    const csvTotalWeightGrams = parsePositiveNumber(row[dataset.totalWeightIndex]);
    const filamentValues = dataset.filamentColumns
      .map((column) => {
        const grams = parsePositiveNumber(row[column.index]);
        if (!grams) {
          return null;
        }

        return {
          csvFilamentName: column.csvFilamentName,
          grams,
        };
      })
      .filter((value): value is { csvFilamentName: string; grams: number } => value !== null);

    if (csvTotalWeightGrams === null && filamentValues.length === 0) {
      continue;
    }

    const sourceUrlCell =
      dataset.sourceUrlIndex !== null ? normalizeWhitespace(row[dataset.sourceUrlIndex] ?? "") : "";

    dataRows.push({
      csvRowIndex,
      csvModelName,
      csvTotalWeightGrams,
      sourceUrl: sourceUrlCell || null,
      filamentValues,
    });
  }

  return dataRows;
}

function confidenceFromScore(score: number): MatchConfidence {
  if (score >= 0.92) {
    return "HIGH";
  }
  if (score >= 0.78) {
    return "MEDIUM";
  }
  return "LOW";
}

function createRowKey(csvRowIndex: number, csvModelName: string) {
  const digest = createHash("sha1").update(`${csvRowIndex}:${csvModelName}`).digest("hex").slice(0, 10);
  return `${csvRowIndex}-${digest}`;
}

function selectBestProductMatch(input: {
  csvModelName: string;
  sourceUrl: string | null;
  products: ProductCandidate[];
}) {
  const csvNameRaw = input.csvModelName;
  const csvNameNormalized = normalizeText(csvNameRaw);
  const csvNameStripped = stripNoiseTokens(csvNameRaw, modelNoiseTokens);
  const normalizedSourceUrl = input.sourceUrl ? normalizeImportedSourceUrl(input.sourceUrl) : null;

  let bestMatch: { product: ProductCandidate; score: number } | null = null;

  for (const product of input.products) {
    if (
      normalizedSourceUrl &&
      product.importSourceNormalizedUrl &&
      normalizeImportedSourceUrl(product.importSourceNormalizedUrl) === normalizedSourceUrl
    ) {
      return {
        product,
        score: 1,
      };
    }

    let bestProductScore = 0;
    for (const candidateName of product.normalizedNames) {
      const exactScore = calculateSimilarityScore(csvNameNormalized, candidateName);
      const strippedScore = csvNameStripped
        ? calculateSimilarityScore(csvNameStripped, stripNoiseTokens(candidateName, modelNoiseTokens))
        : 0;
      bestProductScore = Math.max(bestProductScore, exactScore, strippedScore);
    }

    if (!bestMatch || bestProductScore > bestMatch.score) {
      bestMatch = {
        product,
        score: bestProductScore,
      };
    }
  }

  return bestMatch;
}

function selectBestFilamentMatch(csvFilamentName: string, filaments: FilamentCandidate[]) {
  const normalizedCsvFilament = normalizeText(csvFilamentName);
  const strippedCsvFilament = stripNoiseTokens(csvFilamentName, filamentNoiseTokens);
  let bestMatch: { filament: FilamentCandidate; score: number } | null = null;

  for (const filament of filaments) {
    let bestFilamentScore = 0;
    for (const term of filament.normalizedTerms) {
      const exactScore = calculateSimilarityScore(normalizedCsvFilament, term);
      const strippedTerm = stripNoiseTokens(term, filamentNoiseTokens);
      const strippedScore =
        strippedCsvFilament.length > 0 && strippedTerm.length > 0
          ? calculateSimilarityScore(strippedCsvFilament, strippedTerm)
          : 0;
      bestFilamentScore = Math.max(bestFilamentScore, exactScore, strippedScore);
    }

    if (!bestMatch || bestFilamentScore > bestMatch.score) {
      bestMatch = {
        filament,
        score: bestFilamentScore,
      };
    }
  }

  return bestMatch;
}

export async function previewFilamentWeightImport(csvContent: string): Promise<CsvFilamentWeightPreviewResult> {
  const dataset = parseCsvDataset(csvContent);
  const parsedRows = parseCsvDataRows(dataset);

  if (parsedRows.length === 0) {
    throw new Error("No data rows with weights were found in this CSV.");
  }

  const [products, filaments] = await Promise.all([
    getProductsForCsvPreview(),
    prisma.filament.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        colorLabel: true,
      },
      orderBy: [{ name: "asc" }],
    }),
  ]);

  const productCandidates: ProductCandidate[] = products.map((product) => ({
    id: product.id,
    publicName: product.publicName,
    internalName: product.internalName,
    importSourceNormalizedUrl: product.importSourceNormalizedUrl,
    normalizedNames: Array.from(
      new Set(
        [product.publicName, product.internalName]
          .map((name) => normalizeText(name))
          .filter(Boolean),
      ),
    ),
  }));

  const filamentCandidates: FilamentCandidate[] = filaments.map((filament) => ({
    id: filament.id,
    name: filament.name,
    colorLabel: filament.colorLabel,
    normalizedTerms: Array.from(
      new Set(
        [filament.name, filament.colorLabel, `${filament.name} ${filament.colorLabel}`]
          .flatMap((value) => [normalizeText(value), stripNoiseTokens(value, filamentNoiseTokens)])
          .filter((value) => value.length > 0),
      ),
    ),
  }));

  const previewRows: CsvFilamentWeightPreviewRow[] = parsedRows.map((parsedRow) => {
    const productMatch = selectBestProductMatch({
      csvModelName: parsedRow.csvModelName,
      sourceUrl: parsedRow.sourceUrl,
      products: productCandidates,
    });

    const matchedProduct =
      productMatch && productMatch.score >= 0.66
        ? {
            id: productMatch.product.id,
            publicName: productMatch.product.publicName,
            internalName: productMatch.product.internalName,
            score: Math.round(productMatch.score * 100) / 100,
            confidence: confidenceFromScore(productMatch.score),
          }
        : null;

    const filamentMatches = parsedRow.filamentValues.map((filamentValue) => {
      const filamentMatch = selectBestFilamentMatch(filamentValue.csvFilamentName, filamentCandidates);
      const matchedFilament =
        filamentMatch && filamentMatch.score >= 0.66
          ? {
              id: filamentMatch.filament.id,
              name: filamentMatch.filament.name,
              colorLabel: filamentMatch.filament.colorLabel,
              score: Math.round(filamentMatch.score * 100) / 100,
              confidence: confidenceFromScore(filamentMatch.score),
            }
          : null;

      return {
        csvFilamentName: filamentValue.csvFilamentName,
        grams: filamentValue.grams,
        matchedFilament,
      };
    });

    const matchedFilamentCount = filamentMatches.filter((entry) => entry.matchedFilament !== null).length;
    const unmatchedFilamentCount = filamentMatches.length - matchedFilamentCount;
    const warnings: string[] = [];

    if (!matchedProduct) {
      warnings.push("No confident product match found.");
    }
    if (unmatchedFilamentCount > 0) {
      warnings.push(
        `${unmatchedFilamentCount} filament value${unmatchedFilamentCount === 1 ? "" : "s"} could not be matched.`,
      );
    }

    const canApply = Boolean(
      matchedProduct && (parsedRow.csvTotalWeightGrams !== null || matchedFilamentCount > 0),
    );

    if (matchedProduct && !canApply) {
      warnings.push("No positive total or matched filament grams to apply.");
    }

    return {
      rowKey: createRowKey(parsedRow.csvRowIndex, parsedRow.csvModelName),
      csvRowIndex: parsedRow.csvRowIndex,
      csvModelName: parsedRow.csvModelName,
      csvTotalWeightGrams: parsedRow.csvTotalWeightGrams,
      matchedProduct,
      filamentMatches,
      unmatchedFilamentCount,
      hasProductConflict: false,
      canApply,
      warnings,
    };
  });

  const productMatchCounts = new Map<string, number>();
  for (const row of previewRows) {
    if (!row.matchedProduct) {
      continue;
    }
    productMatchCounts.set(row.matchedProduct.id, (productMatchCounts.get(row.matchedProduct.id) ?? 0) + 1);
  }

  let conflictedRows = 0;
  for (const row of previewRows) {
    if (!row.matchedProduct) {
      continue;
    }

    const collisions = productMatchCounts.get(row.matchedProduct.id) ?? 0;
    if (collisions > 1) {
      row.hasProductConflict = true;
      row.warnings.push("Multiple CSV rows matched this product. Select only one of those rows.");
      conflictedRows += 1;
    }
  }

  const totalFilamentValues = previewRows.reduce((sum, row) => sum + row.filamentMatches.length, 0);
  const matchedFilamentValues = previewRows.reduce(
    (sum, row) => sum + row.filamentMatches.filter((entry) => entry.matchedFilament !== null).length,
    0,
  );
  const applyableRows = previewRows.filter((row) => row.canApply).length;
  const matchedRows = previewRows.filter((row) => row.matchedProduct !== null).length;

  return {
    headerRowIndex: dataset.headerRowIndex,
    rows: previewRows,
    summary: {
      totalRows: previewRows.length,
      matchedRows,
      unmatchedRows: previewRows.length - matchedRows,
      conflictedRows,
      totalFilamentValues,
      matchedFilamentValues,
      unmatchedFilamentValues: totalFilamentValues - matchedFilamentValues,
      applyableRows,
    },
  };
}

function sanitizeApplyRows(rows: CsvFilamentWeightApplyRowInput[]) {
  return rows
    .map((row) => {
      const totalWeightGrams =
        row.totalWeightGrams && Number.isFinite(row.totalWeightGrams) && row.totalWeightGrams > 0
          ? Math.round(row.totalWeightGrams * 100) / 100
          : null;

      const filamentAssignments = Array.from(
        new Map(
          row.filamentAssignments
            .filter((assignment) => assignment.filamentId && Number.isFinite(assignment.grams) && assignment.grams > 0)
            .map((assignment) => [
              assignment.filamentId,
              {
                filamentId: assignment.filamentId,
                csvFilamentName: assignment.csvFilamentName,
                grams: Math.round(assignment.grams * 100) / 100,
              },
            ]),
        ).values(),
      );

      return {
        ...row,
        totalWeightGrams,
        filamentAssignments,
      };
    })
    .filter((row) => row.productId && (row.totalWeightGrams !== null || row.filamentAssignments.length > 0));
}

async function reorderProductFilamentRequirementsAlphabetically(tx: Prisma.TransactionClient, productId: string) {
  const requirements = await tx.productFilamentRequirement.findMany({
    where: { productId },
    include: {
      filament: {
        select: {
          name: true,
        },
      },
    },
  });

  requirements.sort((left, right) => left.filament.name.localeCompare(right.filament.name));

  for (let index = 0; index < requirements.length; index += 1) {
    const requirement = requirements[index];
    if (requirement.sortOrder === index) {
      continue;
    }

    await tx.productFilamentRequirement.update({
      where: { id: requirement.id },
      data: { sortOrder: index },
    });
  }
}

export async function applyFilamentWeightImport(
  inputRows: CsvFilamentWeightApplyRowInput[],
): Promise<CsvFilamentWeightApplyResult> {
  const rows = sanitizeApplyRows(inputRows);
  if (rows.length === 0) {
    throw new Error("No valid rows were selected to apply.");
  }

  const duplicateProductNames = new Map<string, string[]>();
  for (const row of rows) {
    const existing = duplicateProductNames.get(row.productId) ?? [];
    existing.push(row.csvModelName);
    duplicateProductNames.set(row.productId, existing);
  }

  const duplicates = Array.from(duplicateProductNames.entries()).filter(([, csvModelNames]) => csvModelNames.length > 1);
  if (duplicates.length > 0) {
    const labels = duplicates
      .map(([, csvModelNames]) => `"${csvModelNames.slice(0, 3).join(", ")}"`)
      .join("; ");
    throw new Error(`Multiple selected CSV rows matched the same product. Please keep only one per product: ${labels}`);
  }

  let productWeightUpdates = 0;
  let filamentRequirementCreates = 0;
  let filamentRequirementUpdates = 0;
  const touchedProductIds = new Set<string>();

  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      if (row.totalWeightGrams !== null) {
        await tx.product.update({
          where: { id: row.productId },
          data: {
            itemWeightGrams: row.totalWeightGrams,
          },
        });
        productWeightUpdates += 1;
        touchedProductIds.add(row.productId);
      }

      if (row.filamentAssignments.length > 0) {
        const existingRequirements = await tx.productFilamentRequirement.findMany({
          where: { productId: row.productId },
          select: {
            id: true,
            filamentId: true,
          },
        });

        const existingByFilamentId = new Map(existingRequirements.map((requirement) => [requirement.filamentId, requirement]));
        let nextSortOrder = existingRequirements.length;

        for (const assignment of row.filamentAssignments) {
          const existing = existingByFilamentId.get(assignment.filamentId);
          if (existing) {
            await tx.productFilamentRequirement.update({
              where: { id: existing.id },
              data: {
                estimatedGramsPerPrint: assignment.grams,
              },
            });
            filamentRequirementUpdates += 1;
            continue;
          }

          const created = await tx.productFilamentRequirement.create({
            data: {
              productId: row.productId,
              filamentId: assignment.filamentId,
              estimatedGramsPerPrint: assignment.grams,
              sortOrder: nextSortOrder,
            },
            select: {
              id: true,
              filamentId: true,
            },
          });
          existingByFilamentId.set(created.filamentId, created);
          nextSortOrder += 1;
          filamentRequirementCreates += 1;
        }

        touchedProductIds.add(row.productId);
      }
    }

    for (const productId of touchedProductIds) {
      await reorderProductFilamentRequirementsAlphabetically(tx, productId);
    }
  });

  return {
    processedRows: rows.length,
    productsTouched: touchedProductIds.size,
    productWeightUpdates,
    filamentRequirementCreates,
    filamentRequirementUpdates,
  };
}
