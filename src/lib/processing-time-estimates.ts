export type ProcessingEstimateSettings = {
  printerCount: number;
  printerUtilizationRate: number;
  baselineGramsPerHour: number;
  complexityMultiplier: number;
  fixedHoursPerPrint: number;
};

export const DEFAULT_PROCESSING_ESTIMATE_SETTINGS: ProcessingEstimateSettings = {
  printerCount: 3,
  printerUtilizationRate: 0.6,
  baselineGramsPerHour: 31.6,
  complexityMultiplier: 1.15,
  fixedHoursPerPrint: 0.5,
};

export const printerUtilizationRateOptions = [
  {
    value: 0.45,
    label: "Conservative (45% uptime)",
    description: "Frequent downtime and less unattended print time.",
  },
  {
    value: 0.6,
    label: "Balanced (60% uptime)",
    description: "Practical default with normal daily interruptions.",
  },
  {
    value: 0.75,
    label: "Optimistic (75% uptime)",
    description: "High consistency with minimal printer idle time.",
  },
] as const;

export const baselineGramsPerHourOptions = [
  {
    value: 24,
    label: "Slow (24 g/hour)",
    description: "Quality-first profiles and slower parts.",
  },
  {
    value: 31.6,
    label: "Balanced (31.6 g/hour)",
    description: "Based on a 300g print taking about 9.5 hours.",
  },
  {
    value: 38,
    label: "Fast (38 g/hour)",
    description: "Aggressive print settings and easier geometries.",
  },
] as const;

export const complexityMultiplierOptions = [
  {
    value: 1,
    label: "Simple (1.0x)",
    description: "Straightforward geometry with low complexity.",
  },
  {
    value: 1.15,
    label: "Typical (1.15x)",
    description: "Average complexity for day-to-day work.",
  },
  {
    value: 1.3,
    label: "Complex (1.3x)",
    description: "Support-heavy or slower reliability-focused jobs.",
  },
] as const;

export const fixedHoursPerPrintOptions = [
  {
    value: 0.25,
    label: "Low (0.25 h/print)",
    description: "Very streamlined prep and turnaround steps.",
  },
  {
    value: 0.5,
    label: "Typical (0.5 h/print)",
    description: "Setup, plate prep, unload, and reset overhead.",
  },
  {
    value: 0.75,
    label: "High (0.75 h/print)",
    description: "More handling, support cleanup, and interruptions.",
  },
  {
    value: 1,
    label: "Very High (1.0 h/print)",
    description: "Heavy post-processing and frequent operator touch points.",
  },
] as const;

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

function resolveAllowedValue(input: unknown, allowedValues: readonly number[], fallback: number) {
  const numeric = toFiniteNumber(input);
  if (numeric === null) {
    return fallback;
  }

  return allowedValues.some((value) => Math.abs(value - numeric) < 0.0001) ? numeric : fallback;
}

export function resolveProcessingEstimateSettings(input: Partial<ProcessingEstimateSettings>): ProcessingEstimateSettings {
  return {
    printerCount: Math.min(24, Math.max(1, Math.round(toFiniteNumber(input.printerCount) ?? DEFAULT_PROCESSING_ESTIMATE_SETTINGS.printerCount))),
    printerUtilizationRate: resolveAllowedValue(
      input.printerUtilizationRate,
      printerUtilizationRateOptions.map((option) => option.value),
      DEFAULT_PROCESSING_ESTIMATE_SETTINGS.printerUtilizationRate,
    ),
    baselineGramsPerHour: resolveAllowedValue(
      input.baselineGramsPerHour,
      baselineGramsPerHourOptions.map((option) => option.value),
      DEFAULT_PROCESSING_ESTIMATE_SETTINGS.baselineGramsPerHour,
    ),
    complexityMultiplier: resolveAllowedValue(
      input.complexityMultiplier,
      complexityMultiplierOptions.map((option) => option.value),
      DEFAULT_PROCESSING_ESTIMATE_SETTINGS.complexityMultiplier,
    ),
    fixedHoursPerPrint: resolveAllowedValue(
      input.fixedHoursPerPrint,
      fixedHoursPerPrintOptions.map((option) => option.value),
      DEFAULT_PROCESSING_ESTIMATE_SETTINGS.fixedHoursPerPrint,
    ),
  };
}

export type WorkItemTimeEstimate = {
  totalHours: number;
  hoursPerPrint: number;
  machineHoursOnly: number;
  overheadHours: number;
};

export function estimateWorkItemTime(input: {
  totalWeightGrams: unknown;
  quantity: unknown;
  settings: ProcessingEstimateSettings;
}): WorkItemTimeEstimate | null {
  const totalWeightGrams = toFiniteNumber(input.totalWeightGrams);
  const quantity = Math.max(0, Math.round(toFiniteNumber(input.quantity) ?? 0));
  if (totalWeightGrams === null || totalWeightGrams <= 0 || quantity <= 0) {
    return null;
  }

  const machineHoursOnly =
    (totalWeightGrams / Math.max(0.01, input.settings.baselineGramsPerHour)) * input.settings.complexityMultiplier;
  const overheadHours = quantity * input.settings.fixedHoursPerPrint;
  const totalHours = machineHoursOnly + overheadHours;

  return {
    totalHours,
    hoursPerPrint: totalHours / quantity,
    machineHoursOnly,
    overheadHours,
  };
}

export function estimateCalendarHoursFromMachineHours(totalMachineHours: number, settings: ProcessingEstimateSettings) {
  const activeMachines = Math.max(1, settings.printerCount);
  const utilization = Math.max(0.01, settings.printerUtilizationRate);
  return totalMachineHours / (activeMachines * utilization);
}

function stripTrailingZero(value: string) {
  return value.replace(/\.0$/, "");
}

export function formatDurationHours(hours: number) {
  if (!Number.isFinite(hours) || hours <= 0) {
    return "0h";
  }

  if (hours < 1) {
    const minutes = Math.max(1, Math.round(hours * 60));
    return `${minutes}m`;
  }

  if (hours < 24) {
    return `${stripTrailingZero(hours.toFixed(1))}h`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours - days * 24;
  if (remainingHours < 0.25) {
    return `${days}d`;
  }

  return `${days}d ${stripTrailingZero(remainingHours.toFixed(1))}h`;
}

export function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}
