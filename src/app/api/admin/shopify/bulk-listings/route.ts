import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/server/auth/mock-auth-provider";
import { prisma } from "@/lib/prisma";
import { shopifyCategoryTagOptions } from "@/lib/domain";
import { bulkShopifyListingSchema } from "@/server/validation/schemas";
import { createListing } from "@/server/services/listing-service";
import { createShopifyProduct } from "@/server/services/shopify-auth-service";

export const runtime = "nodejs";

type BulkListingRequestBody = {
  items?: unknown;
  shopifyProductStatus?: unknown;
  publicationIds?: unknown;
};

function firstIssueMessage(error: { issues?: { message: string }[] }) {
  return error.issues?.[0]?.message ?? "Invalid form input.";
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: BulkListingRequestBody;
  try {
    body = await request.json() as BulkListingRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const shopifyProductStatus = String(body.shopifyProductStatus ?? "DRAFT");
  const publicationIds = Array.isArray(body.publicationIds) ? body.publicationIds.map(String) : [];
  if (!["ACTIVE", "DRAFT", "UNLISTED"].includes(shopifyProductStatus)) {
    return NextResponse.json({ error: "Select a valid Shopify product status." }, { status: 400 });
  }
  if (shopifyProductStatus === "DRAFT" && publicationIds.length > 0) {
    return NextResponse.json({ error: "A Shopify product must be Active or Unlisted before it can be published to a sales channel." }, { status: 400 });
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "Select at least one product and enter a price." }, { status: 400 });
  }

  const items = [] as Array<ReturnType<typeof bulkShopifyListingSchema.parse>>;
  for (const rawItem of body.items) {
    const parsedItem = bulkShopifyListingSchema.safeParse(rawItem);
    if (!parsedItem.success) {
      return NextResponse.json({ error: firstIssueMessage(parsedItem.error) }, { status: 400 });
    }
    items.push(parsedItem.data);
  }

  const productIds = [...new Set(items.map((item) => item.productId))];
  if (productIds.length !== items.length) {
    return NextResponse.json({ error: "A product can only be included once in a bulk listing." }, { status: 400 });
  }

  const [products, appSetting] = await Promise.all([
    prisma.product.findMany({ where: { id: { in: productIds }, listings: { none: { marketplaceType: "SHOPIFY" } } }, include: { images: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] } } }),
    prisma.appSetting.findUnique({ where: { id: "app" }, select: { publicAppUrl: true } }),
  ]);
  if (products.length !== productIds.length) {
    return NextResponse.json({ error: "One or more products already has a Shopify listing. Refresh this page and try again." }, { status: 409 });
  }

  const appUrl = appSetting?.publicAppUrl;
  if (items.some((item) => item.imageIds.length > 0) && (!appUrl || /^https?:\/\/(localhost|127\.0\.0\.1)/.test(appUrl))) {
    return NextResponse.json({ error: "Set the public app URL in Settings before sending product images to Shopify." }, { status: 400 });
  }

  let created = 0;
  try {
    for (const item of items) {
      const product = products.find((candidate) => candidate.id === item.productId)!;
      const selectedImages = product.images.filter((image) => item.imageIds.includes(image.id));
      const orderedImages = [...selectedImages].sort((left, right) => Number(right.id === item.primaryImageId) - Number(left.id === item.primaryImageId));
      const tags = [...product.tags];
      if (shopifyCategoryTagOptions.some((option) => option.tag === item.categoryTag)) tags.push(item.categoryTag);
      const marketplaceData = await createShopifyProduct({
        title: product.publicName,
        description: product.fullDescription || product.shortDescription,
        tags: [...new Set(tags)],
        productType: product.category,
        price: item.price,
        status: shopifyProductStatus as "ACTIVE" | "DRAFT" | "UNLISTED",
        publicationIds,
        images: orderedImages.map((image) => ({ url: `${appUrl}${image.imagePath}`, alt: image.altText })),
      });
      await createListing({ productId: product.id, marketplaceType: "SHOPIFY", title: product.publicName, description: product.fullDescription || product.shortDescription, tags: [...new Set(tags)].join(", "), price: item.price, externalListingId: marketplaceData.externalListingId, externalUrl: marketplaceData.externalUrl, status: shopifyProductStatus === "DRAFT" ? "DRAFT" : "PUBLISHED", syncStatus: "IN_SYNC" });
      created += 1;
    }
  } catch (error) {
    const suffix = created > 0 ? ` ${created} listing${created === 1 ? " was" : "s were"} created before the failure.` : "";
    return NextResponse.json({ error: `${error instanceof Error ? error.message : "Unable to create bulk listings."}${suffix}` }, { status: 400 });
  }

  revalidatePath("/admin/listings");
  revalidatePath("/admin/products");
  revalidatePath("/catalog");
  return NextResponse.json({ created });
}
