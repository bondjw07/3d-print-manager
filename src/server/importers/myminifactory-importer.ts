import { fetchPageWithFallback } from "./page-fetcher";
import type { ImportedProductData, ProductUrlImporter } from "./types";

const MY_MINI_FACTORY_API_BASE_URL = "https://www.myminifactory.com/api/v2";

function decodeHtml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"')
    .trim();
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function objectIdFromPath(pathname: string) {
  const match = pathname.match(/-(\d+)(?:$|[/?#])/);
  return match?.[1];
}

function normalizePath(pathname: string) {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed || "/";
}

function isMyMiniFactoryHost(hostname: string) {
  return (
    hostname === "myminifactory.com" ||
    hostname === "www.myminifactory.com" ||
    hostname.endsWith(".myminifactory.com")
  );
}

function normalizeTitle(value: string) {
  return value
    .replace(/^3D Printable\s+/i, "")
    .replace(/\s+-\s+by\s+.+$/i, "")
    .replace(/\s+by\s+.+$/i, "")
    .trim();
}

function normalizeImageUrl(value: string) {
  try {
    return new URL(value).toString();
  } catch {
    return value;
  }
}

function cleanMarkdownText(value: string) {
  return value
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/[*_`>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCreatorNameFromPath(pathname: string) {
  const match = pathname.match(/^\/users\/([^/]+)/i)?.[1];
  if (!match) {
    return undefined;
  }

  try {
    return decodeURIComponent(match).replace(/\+/g, " ").trim();
  } catch {
    return match.replace(/\+/g, " ").trim();
  }
}

export function normalizeMyMiniFactoryObjectUrl(rawUrl: string) {
  const decoded = decodeHtml(rawUrl).trim();
  if (!decoded) {
    return null;
  }

  const absoluteMatch = decoded.match(/https?:\/\/(?:www\.)?myminifactory\.com\/object\/[^"'<>)\s]+/i)?.[0];
  const relativeMatch = decoded.match(/\/object\/[^"'<>)\s]+/i)?.[0];
  const sanitized = (absoluteMatch ?? relativeMatch ?? decoded).replace(/[)\]>"',.;]+$/g, "");

  try {
    const parsed = new URL(sanitized, "https://www.myminifactory.com");
    if (!isMyMiniFactoryHost(parsed.hostname)) {
      return null;
    }

    const pathname = normalizePath(parsed.pathname);
    if (!pathname.startsWith("/object/")) {
      return null;
    }

    if (!objectIdFromPath(pathname)) {
      return null;
    }

    parsed.protocol = "https:";
    parsed.hostname = "www.myminifactory.com";
    parsed.pathname = pathname;
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function slugifyForObjectPath(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

function maybeObjectUrlFromRecord(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const directUrlCandidates = [
    record.url,
    record.object_url,
    record.objectUrl,
    record.public_url,
    record.publicUrl,
    record.share_url,
    record.shareUrl,
    record.permalink,
  ];

  for (const candidate of directUrlCandidates) {
    if (typeof candidate !== "string") {
      continue;
    }

    const normalized = normalizeMyMiniFactoryObjectUrl(candidate);
    if (normalized) {
      return normalized;
    }
  }

  const idRaw = record.id ?? record.object_id ?? record.objectId;
  const id = typeof idRaw === "number" || typeof idRaw === "string" ? String(idRaw).match(/\d+/)?.[0] : undefined;
  if (!id) {
    return null;
  }

  const slugRaw =
    typeof record.slug === "string"
      ? record.slug
      : typeof record.object_slug === "string"
        ? record.object_slug
        : typeof record.objectSlug === "string"
          ? record.objectSlug
          : typeof record.name === "string"
            ? record.name
            : typeof record.title === "string"
              ? record.title
              : null;

  if (!slugRaw) {
    return null;
  }

  return normalizeMyMiniFactoryObjectUrl(`https://www.myminifactory.com/object/${slugifyForObjectPath(slugRaw)}-${id}`);
}

function collectObjectUrls(value: unknown, output: Set<string>, depth = 0) {
  if (value === null || value === undefined || depth > 8) {
    return;
  }

  if (typeof value === "string") {
    const normalized = normalizeMyMiniFactoryObjectUrl(value);
    if (normalized) {
      output.add(normalized);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectObjectUrls(item, output, depth + 1);
    }
    return;
  }

  if (typeof value !== "object") {
    return;
  }

  const byRecord = maybeObjectUrlFromRecord(value);
  if (byRecord) {
    output.add(byRecord);
  }

  for (const nested of Object.values(value as Record<string, unknown>)) {
    collectObjectUrls(nested, output, depth + 1);
  }
}

function extractArrayFromPayload(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const arrayKeys = ["data", "objects", "results", "items"];
  for (const key of arrayKeys) {
    const candidate = record[key];
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function parseNextPageFromPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const nextCandidates = [record.next_page, record.nextPage, record.next];
  for (const candidate of nextCandidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) {
      return Math.floor(candidate);
    }

    if (typeof candidate === "string") {
      const direct = Number(candidate);
      if (Number.isFinite(direct) && direct > 0) {
        return Math.floor(direct);
      }

      try {
        const parsed = new URL(candidate, "https://www.myminifactory.com");
        const pageParam = Number(parsed.searchParams.get("page"));
        if (Number.isFinite(pageParam) && pageParam > 0) {
          return Math.floor(pageParam);
        }
      } catch {
        // Ignore invalid next-page URLs.
      }
    }
  }

  const links = record.links;
  if (links && typeof links === "object" && !Array.isArray(links)) {
    const nextLink = (links as Record<string, unknown>).next;
    if (typeof nextLink === "string") {
      try {
        const parsed = new URL(nextLink, "https://www.myminifactory.com");
        const pageParam = Number(parsed.searchParams.get("page"));
        if (Number.isFinite(pageParam) && pageParam > 0) {
          return Math.floor(pageParam);
        }
      } catch {
        // Ignore invalid next-link URLs.
      }
    }
  }

  const currentPage = Number(record.current_page ?? record.currentPage ?? record.page);
  const totalPages = Number(record.total_pages ?? record.totalPages);
  if (Number.isFinite(currentPage) && Number.isFinite(totalPages) && currentPage > 0 && totalPages > currentPage) {
    return Math.floor(currentPage + 1);
  }

  return null;
}

function parseAndNormalizeMyMiniFactoryCreatorInput(input: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Enter a MyMiniFactory creator username or profile URL.");
  }

  if (/^https?:\/\//i.test(trimmed)) {
    let parsed: URL;

    try {
      parsed = new URL(trimmed);
    } catch {
      throw new Error("Enter a valid MyMiniFactory creator URL or username.");
    }

    if (!isMyMiniFactoryHost(parsed.hostname)) {
      throw new Error("Creator URL must be under myminifactory.com.");
    }

    const pathname = normalizePath(parsed.pathname);
    if (!pathname.startsWith("/users/")) {
      throw new Error("MyMiniFactory creator URL must start with /users/.");
    }

    const creatorSegment = pathname.match(/^\/users\/([^/]+)/i)?.[1];
    if (!creatorSegment) {
      throw new Error("Unable to determine MyMiniFactory creator from URL.");
    }

    let creatorName: string;
    try {
      creatorName = decodeURIComponent(creatorSegment).trim();
    } catch {
      creatorName = creatorSegment.trim();
    }
    if (!creatorName) {
      throw new Error("Unable to determine MyMiniFactory creator from URL.");
    }

    return {
      creatorName,
      creatorUrl: `https://www.myminifactory.com/users/${encodeURIComponent(creatorName)}`,
      creatorDisplayName: extractCreatorNameFromPath(pathname),
    };
  }

  const normalized = trimmed
    .replace(/^@/, "")
    .replace(/^users\//i, "")
    .replace(/\/+$/, "");

  if (!normalized) {
    throw new Error("Enter a MyMiniFactory creator username.");
  }

  if (!/^[a-z0-9._-]+$/i.test(normalized)) {
    throw new Error("Creator username may only include letters, numbers, '.', '_' and '-'.");
  }

  return {
    creatorName: normalized,
    creatorUrl: `https://www.myminifactory.com/users/${encodeURIComponent(normalized)}`,
    creatorDisplayName: normalized,
  };
}

export async function discoverMyMiniFactoryCreatorObjectUrls(input: {
  creator: string;
  accessToken: string;
  maxPages?: number;
}) {
  const { creatorName, creatorUrl, creatorDisplayName } = parseAndNormalizeMyMiniFactoryCreatorInput(input.creator);
  const maxPages = Math.min(40, Math.max(1, input.maxPages ?? 20));
  const modelUrls = new Set<string>();

  let pagesScanned = 0;
  let stalePages = 0;
  let page = 1;

  while (page <= maxPages) {
    const endpoint = new URL(`${MY_MINI_FACTORY_API_BASE_URL}/users/${encodeURIComponent(creatorName)}/objects`);
    endpoint.searchParams.set("page", String(page));

    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        accept: "application/json",
        Authorization: `Bearer ${input.accessToken}`,
      },
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      const body = await response.text();
      const detail = body.trim().slice(0, 180);

      if (page === 1) {
        throw new Error(
          detail
            ? `MyMiniFactory creator lookup failed (${response.status}): ${detail}`
            : `MyMiniFactory creator lookup failed (${response.status}).`,
        );
      }

      break;
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      if (page === 1) {
        throw new Error("MyMiniFactory creator lookup returned invalid JSON.");
      }
      break;
    }

    pagesScanned = page;
    const pageItems = extractArrayFromPayload(payload);
    const beforeCount = modelUrls.size;

    if (pageItems.length > 0) {
      for (const item of pageItems) {
        collectObjectUrls(item, modelUrls);
      }
    } else {
      collectObjectUrls(payload, modelUrls);
    }

    if (modelUrls.size === beforeCount) {
      stalePages += 1;
    } else {
      stalePages = 0;
    }

    const nextPage = parseNextPageFromPayload(payload);
    if (stalePages >= 2) {
      break;
    }

    if (!nextPage && pageItems.length === 0) {
      break;
    }

    if (nextPage && nextPage > page && nextPage <= maxPages) {
      page = nextPage;
      continue;
    }

    page += 1;
  }

  return {
    creatorUrl,
    creatorName: creatorDisplayName,
    pagesScanned,
    modelUrls: Array.from(modelUrls),
  };
}

function parseHtml(sourceUrl: string, html: string, objectId?: string): ImportedProductData {
  const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)?.[1];
  const ogDescription = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i)?.[1];
  const titleTag = html.match(/<title>([^<]+)<\/title>/i)?.[1];

  const title = normalizeTitle(decodeHtml(ogTitle ?? titleTag ?? ""));
  if (!title) {
    throw new Error("Unable to parse MyMiniFactory title.");
  }

  const creatorFromAuthorMeta = decodeHtml(html.match(/<meta\s+name="author"\s+content="([^"]+)"/i)?.[1] ?? "");
  const creatorName = creatorFromAuthorMeta || undefined;

  const description = decodeHtml(ogDescription ?? "").trim();

  const imageUrls = unique(
    Array.from(html.matchAll(/<meta\s+property="og:image"\s+content="([^"]+)"/gi))
      .map((match) => normalizeImageUrl(decodeHtml(match[1])))
      .filter(Boolean),
  );

  return {
    source: "MY_MINI_FACTORY",
    sourceUrl,
    sourceReferenceId: objectId,
    creatorName,
    title,
    shortDescription: description.slice(0, 180) || undefined,
    fullDescription: description || undefined,
    category: "Imported",
    tags: [],
    imageUrls,
    fetchMode: "DIRECT_HTML",
  };
}

function parseMarkdown(sourceUrl: string, markdown: string, objectId?: string): ImportedProductData {
  const headingMatches = Array.from(markdown.matchAll(/^#\s+(.+)$/gm)).map((match) => match[1].trim());
  const firstHeading = headingMatches[0] ?? "";
  const bestHeading =
    headingMatches.find((line) => !line.toLowerCase().startsWith("3d printable ") && !line.startsWith("$")) ??
    firstHeading;
  const title = normalizeTitle(bestHeading || firstHeading);

  if (!title) {
    throw new Error("Unable to parse MyMiniFactory object title.");
  }

  const creatorMatch = markdown.match(
    /\[([^\]]+?)\]\((?:https?:\/\/)?(?:www\.)?myminifactory\.com\/users\/[^)]+\)/i,
  )?.[1];
  const creatorName = creatorMatch?.replace(/\s*-\s*by\s*/i, " / ").trim() || undefined;

  const descriptionSection = markdown.split(/\nDescription\n/i)[1]?.split(/\nLicense\n/i)[0] ?? "";
  const descriptionRaw = cleanMarkdownText(descriptionSection);
  const fullDescription = descriptionRaw || title;
  const shortDescription = fullDescription.slice(0, 180);

  const categories = unique(
    Array.from(
      markdown.matchAll(
        /\[([^\]]+)\]\((?:https?:\/\/)?(?:www\.)?myminifactory\.com\/category\/[^)]+\)/gi,
      ),
    ).map((match) => match[1].trim()),
  );

  const imageSearchSection = markdown.split("Interesting objects for you")[0] ?? markdown;
  const imageUrls = unique(
    Array.from(imageSearchSection.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi))
      .map((match) => normalizeImageUrl(match[1]))
      .filter((url) => /https?:\/\/dl\d+\.myminifactory\.com\/object-assets\/.+\/images\//i.test(url))
      .filter((url) => !/\/230X230-/i.test(url)),
  ).slice(0, 16);

  const tags = categories.slice(0, 20);

  return {
    source: "MY_MINI_FACTORY",
    sourceUrl,
    sourceReferenceId: objectId,
    creatorName,
    title,
    shortDescription,
    fullDescription,
    category: categories[0] ?? "Imported",
    tags,
    imageUrls,
    fetchMode: "MIRROR_MARKDOWN",
  };
}

export const myMiniFactoryProductImporter: ProductUrlImporter = {
  source: "MY_MINI_FACTORY",
  supports(url) {
    return isMyMiniFactoryHost(url.hostname);
  },
  async importFromUrl(sourceUrl) {
    const parsedUrl = new URL(sourceUrl);
    const objectId = objectIdFromPath(parsedUrl.pathname);
    const fetched = await fetchPageWithFallback(sourceUrl);

    if (fetched.fetchMode === "DIRECT_HTML") {
      return parseHtml(sourceUrl, fetched.body, objectId);
    }

    return parseMarkdown(sourceUrl, fetched.body, objectId);
  },
};
