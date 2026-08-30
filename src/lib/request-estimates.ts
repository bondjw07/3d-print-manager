type RequestFilamentRequirementEstimateInput = {
  estimatedGramsPerPrint?: unknown;
  filament?: {
    name?: unknown;
    spoolCostPerKg?: unknown;
  } | null;
};

export type RequestEstimateInput = {
  quantity: unknown;
  filamentScalePercent: unknown;
  product: {
    itemWeightGrams?: unknown;
    filamentRequirements?: RequestFilamentRequirementEstimateInput[] | null;
    bambuBuddyFilamentRequirements?: Array<{ materialType?: unknown; hexColor?: unknown; estimatedGramsPerPrint?: unknown }> | null;
    defaultFilamentSpoolCost?: unknown;
  };
};

export type RequestEstimate = {
  totalWeightGrams: number | null;
  calculatedCost: number | null;
};

export type RequestFilamentWeightBreakdownEntry = {
  filamentName: string;
  totalWeightGrams: number;
};

export type RequestFilamentWeightBreakdown = {
  totalWeightGrams: number | null;
  entries: RequestFilamentWeightBreakdownEntry[];
  detail: string;
};

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (typeof value === "bigint") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  if (value && typeof value === "object" && "toString" in value && typeof value.toString === "function") {
    const parsed = Number(value.toString());
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function roundToTwo(value: number) {
  return Math.round(value * 100) / 100;
}

function formatCountLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function resolveFilamentName(requirement: RequestFilamentRequirementEstimateInput, index: number) {
  if (requirement.filament && typeof requirement.filament.name === "string") {
    const normalized = requirement.filament.name.trim();
    if (normalized) {
      return normalized;
    }
  }

  return `Filament ${index + 1}`;
}

export function calculateRequestFilamentWeightBreakdown(input: RequestEstimateInput): RequestFilamentWeightBreakdown {
  const quantity = Math.max(0, toFiniteNumber(input.quantity) ?? 0);
  const filamentScaleMultiplier = Math.max(0, (toFiniteNumber(input.filamentScalePercent) ?? 100) / 100);
  const bambuRequirements = input.product.bambuBuddyFilamentRequirements ?? [];
  const requirements = input.product.filamentRequirements ?? [];
  if (bambuRequirements.length > 0) {
    const entries = bambuRequirements.map((requirement, index) => ({
      filamentName: `${typeof requirement.materialType === "string" ? requirement.materialType : "Filament"} ${typeof requirement.hexColor === "string" ? requirement.hexColor : index + 1}`,
      totalWeightGrams: roundToTwo(Math.max(0, toFiniteNumber(requirement.estimatedGramsPerPrint) ?? 0) * quantity * filamentScaleMultiplier),
    })).filter((entry) => entry.totalWeightGrams > 0);
    return entries.length > 0
      ? { totalWeightGrams: roundToTwo(entries.reduce((sum, entry) => sum + entry.totalWeightGrams, 0)), entries, detail: "BambuBuddy per-filament estimate." }
      : { totalWeightGrams: null, entries: [], detail: "BambuBuddy requirements are missing grams." };
  }
  const filamentTotals = new Map<string, number>();
  let missingEstimateCount = 0;

  requirements.forEach((requirement, index) => {
    const estimatedGramsPerPrint = toFiniteNumber(requirement.estimatedGramsPerPrint);
    if (estimatedGramsPerPrint === null || estimatedGramsPerPrint <= 0) {
      missingEstimateCount += 1;
      return;
    }

    const filamentName = resolveFilamentName(requirement, index);
    const totalWeightGrams = estimatedGramsPerPrint * quantity * filamentScaleMultiplier;
    filamentTotals.set(filamentName, (filamentTotals.get(filamentName) ?? 0) + totalWeightGrams);
  });

  const entries = [...filamentTotals.entries()]
    .sort(([leftName], [rightName]) => leftName.localeCompare(rightName))
    .map(([filamentName, totalWeightGrams]) => ({
      filamentName,
      totalWeightGrams: roundToTwo(totalWeightGrams),
    }));

  if (entries.length > 0) {
    const totalWeightGrams = roundToTwo(entries.reduce((sum, entry) => sum + entry.totalWeightGrams, 0));
    const missingEstimateDetail =
      missingEstimateCount > 0
        ? `${formatCountLabel(missingEstimateCount, "requirement is", "requirements are")} missing grams.`
        : "Per-filament estimate.";

    return {
      totalWeightGrams,
      entries,
      detail: missingEstimateDetail,
    };
  }

  const fallbackItemWeightGrams = toFiniteNumber(input.product.itemWeightGrams);
  if (fallbackItemWeightGrams !== null && fallbackItemWeightGrams > 0) {
    return {
      totalWeightGrams: roundToTwo(fallbackItemWeightGrams * quantity * filamentScaleMultiplier),
      entries: [],
      detail:
        requirements.length === 0
          ? "No filament requirements configured. Total uses product weight fallback."
          : "No per-filament grams configured. Total uses product weight fallback.",
    };
  }

  if (requirements.length === 0) {
    return {
      totalWeightGrams: null,
      entries: [],
      detail: "No filament requirements configured.",
    };
  }

  return {
    totalWeightGrams: null,
    entries: [],
    detail:
      missingEstimateCount > 0
        ? `${formatCountLabel(missingEstimateCount, "requirement is", "requirements are")} missing grams.`
        : "No per-filament weight estimates available.",
  };
}

export function calculateRequestEstimate(input: RequestEstimateInput): RequestEstimate {
  const quantity = Math.max(0, toFiniteNumber(input.quantity) ?? 0);
  const filamentScaleMultiplier = Math.max(0, (toFiniteNumber(input.filamentScalePercent) ?? 100) / 100);
  const requirements = input.product.filamentRequirements ?? [];
  const bambuRequirements = input.product.bambuBuddyFilamentRequirements ?? [];
  const weightBreakdown = calculateRequestFilamentWeightBreakdown(input);

  let calculatedCost = 0;
  let hasCostEstimate = false;

  if (bambuRequirements.length > 0) {
    const defaultSpoolCost = toFiniteNumber(input.product.defaultFilamentSpoolCost);
    const grams = weightBreakdown.totalWeightGrams;
    return {
      totalWeightGrams: grams,
      calculatedCost: defaultSpoolCost !== null && defaultSpoolCost >= 0 && grams !== null
        ? roundToTwo(grams * (defaultSpoolCost / 1000))
        : null,
    };
  }

  for (const requirement of requirements) {
    const estimatedGrams = toFiniteNumber(requirement.estimatedGramsPerPrint);
    if (estimatedGrams === null || estimatedGrams <= 0) {
      continue;
    }

    const spoolCostPerKg = toFiniteNumber(requirement.filament?.spoolCostPerKg);
    if (spoolCostPerKg === null || spoolCostPerKg < 0) {
      continue;
    }

    hasCostEstimate = true;
    calculatedCost += estimatedGrams * quantity * filamentScaleMultiplier * (spoolCostPerKg / 1000);
  }

  return {
    totalWeightGrams: weightBreakdown.totalWeightGrams,
    calculatedCost: hasCostEstimate ? roundToTwo(calculatedCost) : null,
  };
}
