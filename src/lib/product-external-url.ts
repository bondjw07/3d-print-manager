type ProductExternalUrlSource = {
  importSourceUrl?: string | null;
  productionNotes?: string | null;
  listings?: Array<{ externalUrl?: string | null } | null> | null;
};

const IMPORTED_URL_PREFIX = "Imported URL:";

function extractSourceUrlFromNotes(notes: string | null | undefined) {
  if (!notes) {
    return null;
  }

  for (const line of notes.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(IMPORTED_URL_PREFIX)) {
      continue;
    }

    const value = trimmed.slice(IMPORTED_URL_PREFIX.length).trim();
    if (value) {
      return value;
    }
  }

  return null;
}

function normalizeExternalUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  let trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const markdownLinkMatch = trimmed.match(/\[[^\]]+]\((https?:\/\/[^)\s]+)\)/i);
  if (markdownLinkMatch?.[1]) {
    trimmed = markdownLinkMatch[1];
  }

  if (trimmed.startsWith("//")) {
    trimmed = `https:${trimmed}`;
  } else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) && /^[a-z0-9.-]+\.[a-z]{2,}(?:\/|$)/i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

export function getProductExternalUrl(product: ProductExternalUrlSource) {
  const sourceUrl = normalizeExternalUrl(product.importSourceUrl);
  if (sourceUrl) {
    return sourceUrl;
  }

  const noteSourceUrl = normalizeExternalUrl(extractSourceUrlFromNotes(product.productionNotes));
  if (noteSourceUrl) {
    return noteSourceUrl;
  }

  for (const listing of product.listings ?? []) {
    const listingUrl = normalizeExternalUrl(listing?.externalUrl ?? null);
    if (listingUrl) {
      return listingUrl;
    }
  }

  return null;
}
