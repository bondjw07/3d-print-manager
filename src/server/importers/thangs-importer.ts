import { fetchMirrorPage, fetchPageWithFallback } from "./page-fetcher";
import type { ImportedProductData, ProductUrlImporter } from "./types";

function decodeHtml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"')
    .trim();
}

function modelIdFromPath(pathname: string) {
  const match = pathname.match(/-(\d+)(?:$|[/?#])/);
  return match?.[1];
}

function normalizePath(pathname: string) {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed || "/";
}

function isThangsHost(hostname: string) {
  return hostname === "thangs.com" || hostname === "www.thangs.com" || hostname.endsWith(".thangs.com");
}

function normalizeThangsModelUrl(rawUrl: string) {
  const decoded = decodeHtml(rawUrl).trim();
  const absoluteMatch = decoded.match(
    /https?:\/\/(?:www\.)?thangs\.com\/designer\/[^/\s"'<>]+\/3d-model\/[^"'<>]*?-\d+/i,
  )?.[0];
  const relativeMatch = decoded.match(/\/designer\/[^/\s"'<>]+\/3d-model\/[^"'<>]*?-\d+/i)?.[0];
  const sanitized = (absoluteMatch ?? relativeMatch ?? decoded).replace(/[)\]>"',.;]+$/g, "");

  try {
    const parsed = new URL(sanitized, "https://thangs.com");
    if (!isThangsHost(parsed.hostname)) {
      return null;
    }

    const pathname = normalizePath(parsed.pathname);
    if (!pathname.includes("/3d-model/")) {
      return null;
    }

    const lastSegment = pathname.split("/").pop() ?? "";
    if (!/-(\d+)$/.test(lastSegment)) {
      return null;
    }

    parsed.protocol = "https:";
    parsed.hostname = "thangs.com";
    parsed.pathname = pathname;
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function extractCreatorNameFromPath(pathname: string) {
  const match = pathname.match(/^\/designer\/([^/]+)/i);
  if (!match?.[1]) {
    return undefined;
  }

  try {
    return decodeURIComponent(match[1]).replace(/\+/g, " ").trim();
  } catch {
    return match[1].replace(/\+/g, " ").trim();
  }
}

function creatorUrlFromThangsPath(pathname: string) {
  const creatorSegment = pathname.match(/^\/designer\/([^/]+)/i)?.[1];
  if (!creatorSegment) {
    return undefined;
  }

  return `https://thangs.com/designer/${creatorSegment}`;
}

function parseAndNormalizeThangsCreatorUrl(sourceUrl: string) {
  let parsed: URL;

  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw new Error("Enter a valid Thangs creator URL.");
  }

  if (!isThangsHost(parsed.hostname)) {
    throw new Error("Enter a Thangs creator URL under thangs.com.");
  }

  const pathname = normalizePath(parsed.pathname);
  if (!pathname.startsWith("/designer/")) {
    throw new Error("Thangs creator URL must start with /designer/.");
  }

  if (pathname.includes("/3d-model/")) {
    throw new Error("That URL is a single model page. Use the creator profile URL for creator import.");
  }

  const creatorSegment = pathname.match(/^\/designer\/([^/]+)/i)?.[1];
  if (!creatorSegment) {
    throw new Error("Unable to determine Thangs creator from URL.");
  }

  const canonicalUrl = `https://thangs.com/designer/${creatorSegment}`;

  return {
    canonicalUrl,
    creatorName: extractCreatorNameFromPath(pathname),
  };
}

const THANGS_CREATOR_DISCOVERY_MAX_PAGES = 200;

function buildCreatorDiscoveryPageUrl(canonicalCreatorUrl: string, page: number) {
  if (page <= 1) {
    return canonicalCreatorUrl;
  }

  const parsed = new URL(canonicalCreatorUrl);
  parsed.searchParams.set("page", String(page));
  return parsed.toString();
}

function buildCreatorDiscoveryRoots(canonicalCreatorUrl: string) {
  return unique([
    canonicalCreatorUrl,
    `${canonicalCreatorUrl}/3d-models`,
    `${canonicalCreatorUrl}/3d-model`,
    `${canonicalCreatorUrl}/free-3d-models`,
    `${canonicalCreatorUrl}/paid-3d-models`,
  ]);
}

function extractModelUrlsFromContent(content: string) {
  const candidates: string[] = [];
  const markdownAbsolutePattern =
    /\[[^\]]*]\((https?:\/\/(?:www\.)?thangs\.com\/designer\/[^)\s]+\/3d-model\/[^)\s]+)\)/gi;
  const markdownRelativePattern = /\[[^\]]*]\((\/designer\/[^)\s]+\/3d-model\/[^)\s]+)\)/gi;
  const absolutePattern = /https?:\/\/(?:www\.)?thangs\.com\/designer\/[^\s"'<>]+\/3d-model\/[^\s"'<>]+/gi;
  const relativePattern = /\/designer\/[^\s"'<>]+\/3d-model\/[^\s"'<>]+/gi;

  for (const match of content.matchAll(markdownAbsolutePattern)) {
    candidates.push(match[1]);
  }

  for (const match of content.matchAll(markdownRelativePattern)) {
    candidates.push(match[1]);
  }

  for (const match of content.matchAll(absolutePattern)) {
    candidates.push(match[0]);
  }

  for (const match of content.matchAll(relativePattern)) {
    candidates.push(match[0]);
  }

  return unique(
    candidates
      .map((candidate) => normalizeThangsModelUrl(candidate))
      .filter((candidate): candidate is string => Boolean(candidate)),
  );
}

export function isThangsCreatorUrl(sourceUrl: string) {
  try {
    const parsed = new URL(sourceUrl);
    const pathname = normalizePath(parsed.pathname);
    return isThangsHost(parsed.hostname) && pathname.startsWith("/designer/") && !pathname.includes("/3d-model/");
  } catch {
    return false;
  }
}

export async function discoverThangsCreatorModelUrls(input: { creatorUrl: string; maxPages?: number }) {
  const { canonicalUrl, creatorName } = parseAndNormalizeThangsCreatorUrl(input.creatorUrl);
  const maxPages = Math.min(THANGS_CREATOR_DISCOVERY_MAX_PAGES, Math.max(1, input.maxPages ?? 12));
  const discoveryRoots = buildCreatorDiscoveryRoots(canonicalUrl);

  const modelUrls = new Set<string>();
  let pagesScanned = 0;

  for (let rootIndex = 0; rootIndex < discoveryRoots.length; rootIndex += 1) {
    const discoveryRoot = discoveryRoots[rootIndex];
    let stalePages = 0;

    for (let page = 1; page <= maxPages; page += 1) {
      const pageUrl = buildCreatorDiscoveryPageUrl(discoveryRoot, page);

      let fetchedBody: string;
      try {
        const fetched = await fetchMirrorPage(pageUrl);
        fetchedBody = fetched.body;
      } catch (error) {
        if (rootIndex === 0 && page === 1) {
          throw error;
        }
        break;
      }

      pagesScanned += 1;
      const beforeCount = modelUrls.size;
      const foundUrls = extractModelUrlsFromContent(fetchedBody);

      for (const modelUrl of foundUrls) {
        modelUrls.add(modelUrl);
      }

      if (modelUrls.size === beforeCount) {
        stalePages += 1;
      } else {
        stalePages = 0;
      }

      if (stalePages >= 2) {
        break;
      }
    }
  }

  return {
    creatorUrl: canonicalUrl,
    creatorName,
    pagesScanned,
    modelUrls: Array.from(modelUrls),
  };
}

function normalizeImageUrl(value: string) {
  try {
    const parsed = new URL(value);
    if (parsed.pathname === "/_next/image") {
      const raw = parsed.searchParams.get("url");
      if (raw) {
        return decodeURIComponent(raw);
      }
    }

    return parsed.toString();
  } catch {
    return value;
  }
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function isImportableThangsImage(url: string) {
  const lower = url.toLowerCase();
  if (lower.includes("/uploads/avatars/")) {
    return false;
  }

  return (
    lower.includes("production-thangs-public/uploads/attachments/") ||
    lower.includes("production-thangs-public/uploads/enhanced_images/")
  );
}

function extractMarkdownImageUrls(markdown: string) {
  const urls: string[] = [];
  const imagePattern = /!\[[^\]]*]\((https?:\/\/(?:[^()\s]|\([^)]*\))+)\)/gi;

  for (const match of markdown.matchAll(imagePattern)) {
    urls.push(match[1]);
  }

  return urls;
}

function cleanMarkdownText(value: string) {
  return decodeHtml(value)
    .replace(/!\[[^\]]*]\((?:[^()\s]|\([^)]*\))+\)/g, " ")
    .replace(/\[([^\]]+)\]\((?:[^()\s]|\([^)]*\))+\)/g, "$1 ")
    .replace(/\[([^\]]+)\]\((?:[^)]*)/g, "$1 ")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanMarkdownDescription(value: string) {
  return cleanMarkdownText(value)
    .replace(/^description\s*[:\-]?\s*/i, "")
    .trim();
}

function decodeModelTitleFromSourceUrl(sourceUrl: string) {
  try {
    const parsed = new URL(sourceUrl);
    const pathname = normalizePath(parsed.pathname);
    const modelSegment = pathname.split("/3d-model/")[1]?.trim();
    if (!modelSegment) {
      return null;
    }

    const withoutId = modelSegment.replace(/-(\d+)(?:$|[/?#].*)/, "").trim();
    if (!withoutId) {
      return null;
    }

    const decoded = decodeURIComponent(withoutId.replace(/\+/g, " ")).trim();
    return decoded || null;
  } catch {
    return null;
  }
}

function stripThangsTitleSuffix(value: string) {
  return value
    .replace(/\s*-\s*3D model by\s+.+?(?:\s+on\s+Thangs)?$/i, "")
    .trim();
}

function parseThangsTitleAndCreatorFromLine(line: string) {
  const compactLine = line.replace(/\s+/g, " ").trim();
  if (!compactLine) {
    return { title: null as string | null, creatorName: undefined as string | undefined };
  }

  const titleAndCreator = compactLine.match(/^(.+?)\s*-\s*3D model by\s+(.+?)(?:\s+on\s+Thangs)?$/i);
  if (titleAndCreator) {
    return {
      title: titleAndCreator[1]?.trim() || null,
      creatorName: titleAndCreator[2]?.trim() || undefined,
    };
  }

  const cleanedTitle = stripThangsTitleSuffix(compactLine);
  return {
    title: cleanedTitle || null,
    creatorName: undefined,
  };
}

function extractThangsTitleAndCreatorFromMarkdown(markdown: string, sourceUrl: string) {
  const headingLine = markdown.match(/^#\s+(.+)$/im)?.[1]?.trim() ?? "";
  const titleLine = markdown.match(/^Title:\s+(.+)$/im)?.[1]?.trim() ?? "";

  const headingParsed = parseThangsTitleAndCreatorFromLine(headingLine);
  if (headingParsed.title) {
    return headingParsed;
  }

  const titleParsed = parseThangsTitleAndCreatorFromLine(titleLine);
  if (titleParsed.title) {
    return titleParsed;
  }

  const fallbackTitle = decodeModelTitleFromSourceUrl(sourceUrl);
  return {
    title: fallbackTitle,
    creatorName: undefined,
  };
}

function parseHtml(sourceUrl: string, html: string, modelId?: string): ImportedProductData {
  const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)?.[1];
  const ogDescription = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i)?.[1];
  const titleTag = html.match(/<title>([^<]+)<\/title>/i)?.[1];

  const titleCandidate = decodeHtml(ogTitle ?? titleTag ?? "");
  const cleanTitle = stripThangsTitleSuffix(titleCandidate);
  const fallbackTitle = decodeModelTitleFromSourceUrl(sourceUrl);
  const resolvedTitle = cleanTitle || fallbackTitle || "";

  if (!resolvedTitle) {
    throw new Error("Unable to parse Thangs title.");
  }

  const creatorNameFromMeta =
    decodeHtml(html.match(/<meta\s+property="og:site_name"\s+content="([^"]+)"/i)?.[1] ?? "") || undefined;
  const creatorName = creatorNameFromMeta || (() => {
    try {
      const parsed = new URL(sourceUrl);
      return extractCreatorNameFromPath(parsed.pathname);
    } catch {
      return undefined;
    }
  })();
  const creatorUrl = (() => {
    try {
      const parsed = new URL(sourceUrl);
      return creatorUrlFromThangsPath(parsed.pathname);
    } catch {
      return undefined;
    }
  })();

  const ogImages = Array.from(html.matchAll(/<meta\s+property="og:image"\s+content="([^"]+)"/gi))
    .map((match) => match[1])
    .map((imageUrl) => normalizeImageUrl(decodeHtml(imageUrl)));

  const inlineImages = Array.from(
    html.matchAll(/https:\/\/thangs\.com\/_next\/image\?url=([^"&]+)(?:&amp;|&)?(?:w|q)=/gi),
  ).map((match) => normalizeImageUrl(`https://thangs.com/_next/image?url=${match[1]}`));

  const imageUrls = unique(
    [...ogImages, ...inlineImages].filter((imageUrl) => isImportableThangsImage(imageUrl)),
  ).slice(0, 20);

  const description = cleanMarkdownDescription(ogDescription ?? "");
  const shortDescription = description.slice(0, 180);

  return {
    source: "THANGS",
    sourceUrl,
    sourceReferenceId: modelId,
    creatorName,
    creatorUrl,
    title: resolvedTitle,
    shortDescription: shortDescription || undefined,
    fullDescription: description || undefined,
    category: "Imported",
    tags: [],
    imageUrls,
    fetchMode: "DIRECT_HTML",
  };
}

function parseMarkdown(sourceUrl: string, markdown: string, modelId?: string): ImportedProductData {
  const extracted = extractThangsTitleAndCreatorFromMarkdown(markdown, sourceUrl);
  const title = extracted.title;
  const creatorName = extracted.creatorName;
  const creatorUrl = (() => {
    try {
      const parsed = new URL(sourceUrl);
      return creatorUrlFromThangsPath(parsed.pathname);
    } catch {
      return undefined;
    }
  })();

  if (!title) {
    throw new Error("Unable to parse Thangs model title from source.");
  }

  const summaryLineRaw = markdown.match(/downloads[^\n]*?·\*\*[^*]+\*\*\s*([^\n]+)/i)?.[1]?.trim();

  const descriptionBlock = markdown
    .split("View license.")[1]
    ?.split("### Tags:")[0]
    ?.replaceAll("* * *", "")
    ?.trim();

  const summaryLine = summaryLineRaw ? cleanMarkdownText(summaryLineRaw) : "";
  const cleanedDescription = descriptionBlock ? cleanMarkdownDescription(descriptionBlock) : "";
  const fullDescription = (cleanedDescription || summaryLine || title).slice(0, 4000);
  const shortDescription = (summaryLine || fullDescription).slice(0, 180);

  const categories = unique(
    Array.from(markdown.matchAll(/\[([^\]]+)\]\(http:\/\/thangs\.com\/category\/[^)]+\)/gi)).map((match) =>
      match[1].trim(),
    ),
  );

  const tagSection = markdown.split("### Tags:")[1]?.split("Add a comment")[0] ?? "";
  const tags = unique(
    Array.from(tagSection.matchAll(/\[([^\]]+)\]\(http:\/\/thangs\.com\/tag\/[^)]+\)/gi)).map((match) =>
      match[1].trim(),
    ),
  );

  const primarySection = markdown.split("### Tags:")[0] ?? markdown;
  const rawImages = extractMarkdownImageUrls(primarySection).map((url) => normalizeImageUrl(url));
  const imageUrls = unique(rawImages.filter((url) => isImportableThangsImage(url))).slice(0, 20);

  return {
    source: "THANGS",
    sourceUrl,
    sourceReferenceId: modelId,
    creatorName: creatorName || undefined,
    creatorUrl,
    title,
    shortDescription,
    fullDescription,
    category: categories[0] ?? "Imported",
    tags,
    imageUrls,
    fetchMode: "MIRROR_MARKDOWN",
  };
}

export const thangsProductImporter: ProductUrlImporter = {
  source: "THANGS",
  supports(url) {
    return isThangsHost(url.hostname) && normalizePath(url.pathname).includes("/3d-model/");
  },
  async importFromUrl(sourceUrl) {
    const parsedUrl = new URL(sourceUrl);
    const modelId = modelIdFromPath(parsedUrl.pathname);
    const fetched = await fetchPageWithFallback(sourceUrl);

    if (fetched.fetchMode === "DIRECT_HTML") {
      return parseHtml(sourceUrl, fetched.body, modelId);
    }

    return parseMarkdown(sourceUrl, fetched.body, modelId);
  },
};
