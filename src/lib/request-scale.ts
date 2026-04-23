export const DEFAULT_SCALE_PERCENT = 100;
export const DEFAULT_KIT_KILN_MODEL_SCALE_PERCENT = 75;
export const DEFAULT_KIT_KILN_FILAMENT_SCALE_PERCENT = 50;

const KIT_KILN_NAME_TOKEN = "kit kiln";
const KIT_KILN_COMPACT_TOKEN = "kitkiln";
const KIT_KILN_COMPACT_WITH_ARTICLE_TOKEN = "thekitkiln";

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeCompactText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeCandidate(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isApproximately(left: number, right: number) {
  return Math.abs(left - right) < 0.001;
}

export function normalizeScalePercent(value: number, fallback = DEFAULT_SCALE_PERCENT) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.round(value * 100) / 100;
}

export function isKitKilnModel(product: {
  importSourceCreatorName?: string | null;
  importSourceCreatorUrl?: string | null;
  importSourceUrl?: string | null;
  productionNotes?: string | null;
}) {
  const candidates = [
    product.importSourceCreatorName,
    product.importSourceCreatorUrl,
    product.importSourceUrl,
    product.productionNotes,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => normalizeCandidate(value));

  return candidates.some((candidate) => {
    const normalized = normalizeSearchText(candidate);
    if (normalized.includes(KIT_KILN_NAME_TOKEN)) {
      return true;
    }

    const compact = normalizeCompactText(candidate);
    return compact.includes(KIT_KILN_COMPACT_TOKEN) || compact.includes(KIT_KILN_COMPACT_WITH_ARTICLE_TOKEN);
  });
}

export function defaultFilamentScalePercentForModelScale(input: {
  modelScalePercent: number;
  isKitKilnModel: boolean;
}) {
  if (
    input.isKitKilnModel &&
    isApproximately(normalizeScalePercent(input.modelScalePercent), DEFAULT_KIT_KILN_MODEL_SCALE_PERCENT)
  ) {
    return DEFAULT_KIT_KILN_FILAMENT_SCALE_PERCENT;
  }

  return DEFAULT_SCALE_PERCENT;
}

export function isKitKilnUserModelScaleAllowed(modelScalePercent: number) {
  return (
    isApproximately(modelScalePercent, DEFAULT_SCALE_PERCENT) ||
    isApproximately(modelScalePercent, DEFAULT_KIT_KILN_MODEL_SCALE_PERCENT)
  );
}
