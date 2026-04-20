import { myMiniFactoryProductImporter } from "./myminifactory-importer";
import { thangsProductImporter } from "./thangs-importer";
import type { ProductUrlImporter } from "./types";

const importers: ProductUrlImporter[] = [thangsProductImporter, myMiniFactoryProductImporter];

export function getSupportedImporterSources() {
  return importers.map((importer) => importer.source);
}

export function resolveProductImporter(sourceUrl: string): ProductUrlImporter | null {
  let parsed: URL;

  try {
    parsed = new URL(sourceUrl);
  } catch {
    return null;
  }

  return importers.find((importer) => importer.supports(parsed)) ?? null;
}
