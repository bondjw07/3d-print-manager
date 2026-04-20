import { prisma } from "@/lib/prisma";

export type FilamentTextMatch = {
  filamentId: string;
  name: string;
  colorLabel: string;
  matchTerm: string;
  matchIndex: number;
};

function normalizeForSearch(value: string) {
  return ` ${value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ")} `;
}

function buildFilamentSearchTerms(filament: { name: string; colorLabel: string }) {
  const terms = new Set<string>();

  const addTerm = (value: string) => {
    const normalized = value.trim().replace(/\s+/g, " ");
    if (normalized.length >= 3) {
      terms.add(normalized);
    }
  };

  addTerm(filament.name);

  const trimmedName = filament.name
    .replace(/\b(pla|petg|abs|asa|tpu|panchroma|matte|silk)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  addTerm(trimmedName);

  const colorTokenCount = filament.colorLabel.trim().split(/\s+/).filter(Boolean).length;
  if (colorTokenCount >= 2 || filament.colorLabel.trim().length >= 8) {
    addTerm(filament.colorLabel);
  }

  return Array.from(terms);
}

export async function guessFilamentsFromText(
  sourceText: string,
  options?: {
    includeInactive?: boolean;
    limit?: number;
  },
) {
  const normalizedSource = normalizeForSearch(sourceText);
  if (normalizedSource.trim().length === 0) {
    return [] as FilamentTextMatch[];
  }

  const filaments = await prisma.filament.findMany({
    where: options?.includeInactive ? undefined : { isActive: true },
    select: {
      id: true,
      name: true,
      colorLabel: true,
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  const matches: FilamentTextMatch[] = [];

  for (const filament of filaments) {
    const terms = buildFilamentSearchTerms(filament);
    let bestMatch: FilamentTextMatch | null = null;

    for (const term of terms) {
      const normalizedTerm = normalizeForSearch(term);
      if (normalizedTerm.trim().length === 0) {
        continue;
      }

      const index = normalizedSource.indexOf(normalizedTerm);
      if (index < 0) {
        continue;
      }

      const candidate: FilamentTextMatch = {
        filamentId: filament.id,
        name: filament.name,
        colorLabel: filament.colorLabel,
        matchTerm: term,
        matchIndex: index,
      };

      if (!bestMatch) {
        bestMatch = candidate;
        continue;
      }

      if (candidate.matchIndex < bestMatch.matchIndex) {
        bestMatch = candidate;
        continue;
      }

      if (candidate.matchIndex === bestMatch.matchIndex && candidate.matchTerm.length > bestMatch.matchTerm.length) {
        bestMatch = candidate;
      }
    }

    if (bestMatch) {
      matches.push(bestMatch);
    }
  }

  matches.sort((a, b) => {
    if (a.matchIndex !== b.matchIndex) {
      return a.matchIndex - b.matchIndex;
    }
    return b.matchTerm.length - a.matchTerm.length;
  });

  const limit = options?.limit ?? 16;
  return matches.slice(0, Math.max(1, limit));
}
