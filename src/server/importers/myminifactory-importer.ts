import { fetchPageWithFallback } from "./page-fetcher";
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

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function objectIdFromPath(pathname: string) {
  const match = pathname.match(/-(\d+)(?:$|[/?#])/);
  return match?.[1];
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
    return url.hostname === "myminifactory.com" || url.hostname === "www.myminifactory.com";
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
