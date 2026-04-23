type RequestFilamentRequirementEstimateInput = {
  estimatedGramsPerPrint?: unknown;
  filament?: {
    spoolCostPerKg?: unknown;
  } | null;
};

export type RequestEstimateInput = {
  quantity: unknown;
  filamentScalePercent: unknown;
  product: {
    itemWeightGrams?: unknown;
    filamentRequirements?: RequestFilamentRequirementEstimateInput[] | null;
  };
};

export type RequestEstimate = {
  totalWeightGrams: number | null;
  calculatedCost: number | null;
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

export function calculateRequestEstimate(input: RequestEstimateInput): RequestEstimate {
  const quantity = Math.max(0, toFiniteNumber(input.quantity) ?? 0);
  const filamentScaleMultiplier = Math.max(0, (toFiniteNumber(input.filamentScalePercent) ?? 100) / 100);
  const requirements = input.product.filamentRequirements ?? [];

  let gramsPerPrintFromRequirements = 0;
  let hasWeightEstimateFromRequirements = false;
  let calculatedCost = 0;
  let hasCostEstimate = false;

  for (const requirement of requirements) {
    const estimatedGrams = toFiniteNumber(requirement.estimatedGramsPerPrint);
    if (estimatedGrams === null || estimatedGrams <= 0) {
      continue;
    }

    hasWeightEstimateFromRequirements = true;
    gramsPerPrintFromRequirements += estimatedGrams;

    const spoolCostPerKg = toFiniteNumber(requirement.filament?.spoolCostPerKg);
    if (spoolCostPerKg === null || spoolCostPerKg < 0) {
      continue;
    }

    hasCostEstimate = true;
    calculatedCost += estimatedGrams * quantity * filamentScaleMultiplier * (spoolCostPerKg / 1000);
  }

  const fallbackItemWeightGrams = toFiniteNumber(input.product.itemWeightGrams);
  let totalWeightGrams: number | null = null;

  if (hasWeightEstimateFromRequirements) {
    totalWeightGrams = gramsPerPrintFromRequirements * quantity * filamentScaleMultiplier;
  } else if (fallbackItemWeightGrams !== null && fallbackItemWeightGrams > 0) {
    totalWeightGrams = fallbackItemWeightGrams * quantity * filamentScaleMultiplier;
  }

  return {
    totalWeightGrams: totalWeightGrams === null ? null : roundToTwo(totalWeightGrams),
    calculatedCost: hasCostEstimate ? roundToTwo(calculatedCost) : null,
  };
}
