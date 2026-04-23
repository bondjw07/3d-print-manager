import { z } from "zod";
import { prisma } from "@/lib/prisma";

type ParsedHeader = {
  headerRowIndex: number;
  columns: {
    name: number;
    brand: number | null;
    colorLabel: number;
    materialType: number;
  };
};

type ParsedCsvRow = {
  csvRowIndex: number;
  name: string;
  brand: string | null;
  colorLabel: string;
  materialType: string;
};

export type FilamentCsvImportResult = {
  totalRows: number;
  createdCount: number;
  duplicateCount: number;
  invalidCount: number;
  warnings: string[];
};

const filamentCsvRowSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  brand: z.string().trim().optional(),
  colorLabel: z.string().trim().min(1, "Color is required."),
  materialType: z.string().trim().min(1, "Material type is required."),
});

const MAX_WARNING_MESSAGES = 25;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeHeaderCell(value: string) {
  return normalizeWhitespace(
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " "),
  );
}

function normalizeKeyPart(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return normalizeWhitespace(
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, ""),
  );
}

function toFilamentKey(input: { name: string; brand: string | null; colorLabel: string; materialType: string }) {
  return [
    normalizeKeyPart(input.name),
    normalizeKeyPart(input.brand),
    normalizeKeyPart(input.colorLabel),
    normalizeKeyPart(input.materialType),
  ].join("|");
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

function resolveHeader(rows: string[][]): ParsedHeader {
  const aliases: Record<"name" | "brand" | "colorLabel" | "materialType", readonly string[]> = {
    name: ["name", "filament name"],
    brand: ["brand", "manufacturer", "maker"],
    colorLabel: ["color", "colour", "color label", "colour label"],
    materialType: ["material type", "material", "type", "materialtype"],
  };

  for (let headerRowIndex = 0; headerRowIndex < rows.length; headerRowIndex += 1) {
    const normalizedHeader = rows[headerRowIndex].map((value) => normalizeHeaderCell(value));
    const columns = {
      name: normalizedHeader.findIndex((value) => aliases.name.includes(value)),
      brand: normalizedHeader.findIndex((value) => aliases.brand.includes(value)),
      colorLabel: normalizedHeader.findIndex((value) => aliases.colorLabel.includes(value)),
      materialType: normalizedHeader.findIndex((value) => aliases.materialType.includes(value)),
    };

    if (columns.name >= 0 && columns.colorLabel >= 0 && columns.materialType >= 0) {
      return {
        headerRowIndex,
        columns: {
          name: columns.name,
          brand: columns.brand >= 0 ? columns.brand : null,
          colorLabel: columns.colorLabel,
          materialType: columns.materialType,
        },
      };
    }
  }

  throw new Error(
    'CSV header not found. Expected columns: "name", "color", and "material type" (with optional "brand").',
  );
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
    const name = normalizeWhitespace(row[columns.name] ?? "");
    const brand = columns.brand === null ? "" : normalizeWhitespace(row[columns.brand] ?? "");
    const colorLabel = normalizeWhitespace(row[columns.colorLabel] ?? "");
    const materialType = normalizeWhitespace(row[columns.materialType] ?? "");

    if (!name && !brand && !colorLabel && !materialType) {
      continue;
    }

    parsedRows.push({
      csvRowIndex,
      name,
      brand: brand || null,
      colorLabel,
      materialType,
    });
  }

  return parsedRows;
}

function addWarning(target: string[], message: string) {
  if (target.length < MAX_WARNING_MESSAGES) {
    target.push(message);
  }
}

function firstIssueMessage(error: z.ZodError) {
  return error.issues[0]?.message ?? "Invalid row.";
}

export async function importFilamentsFromCsv(csvContent: string): Promise<FilamentCsvImportResult> {
  const parsedRows = parseCsvDataRows(csvContent);
  if (parsedRows.length === 0) {
    throw new Error("No data rows found after the CSV header.");
  }

  const existingFilaments = await prisma.filament.findMany({
    select: {
      name: true,
      brand: true,
      colorLabel: true,
      materialType: true,
    },
  });

  const existingKeys = new Set(
    existingFilaments.map((filament) =>
      toFilamentKey({
        name: filament.name,
        brand: filament.brand,
        colorLabel: filament.colorLabel,
        materialType: filament.materialType,
      }),
    ),
  );

  const csvKeys = new Set<string>();
  const createRows: Array<{
    name: string;
    brand: string | null;
    colorLabel: string;
    materialType: string;
    isActive: boolean;
  }> = [];

  const warnings: string[] = [];
  let duplicateCount = 0;
  let invalidCount = 0;

  for (const row of parsedRows) {
    const validated = filamentCsvRowSchema.safeParse({
      name: row.name,
      brand: row.brand ?? undefined,
      colorLabel: row.colorLabel,
      materialType: row.materialType,
    });

    if (!validated.success) {
      invalidCount += 1;
      addWarning(warnings, `Row ${row.csvRowIndex + 1}: ${firstIssueMessage(validated.error)}`);
      continue;
    }

    const normalizedBrand = validated.data.brand?.trim() || null;
    const key = toFilamentKey({
      name: validated.data.name,
      brand: normalizedBrand,
      colorLabel: validated.data.colorLabel,
      materialType: validated.data.materialType,
    });

    if (csvKeys.has(key)) {
      duplicateCount += 1;
      addWarning(warnings, `Row ${row.csvRowIndex + 1}: duplicate of another row in this CSV.`);
      continue;
    }

    if (existingKeys.has(key)) {
      duplicateCount += 1;
      addWarning(warnings, `Row ${row.csvRowIndex + 1}: already exists in the filament catalog.`);
      continue;
    }

    csvKeys.add(key);
    createRows.push({
      name: validated.data.name,
      brand: normalizedBrand,
      colorLabel: validated.data.colorLabel,
      materialType: validated.data.materialType,
      isActive: true,
    });
  }

  let createdCount = 0;
  if (createRows.length > 0) {
    const created = await prisma.filament.createMany({
      data: createRows,
    });
    createdCount = created.count;
  }

  const hiddenWarningCount = duplicateCount + invalidCount - warnings.length;
  if (hiddenWarningCount > 0) {
    warnings.push(`...and ${hiddenWarningCount} more warning${hiddenWarningCount === 1 ? "" : "s"}.`);
  }

  return {
    totalRows: parsedRows.length,
    createdCount,
    duplicateCount,
    invalidCount,
    warnings,
  };
}
