import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getSettings } from "./settings-service";

const SHOPIFY_API_VERSION = "2026-07";
const TOKEN_REFRESH_SAFETY_MS = 60_000;

type ShopifyTokenResponse = { access_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };

export type ShopifyIntegrationStatus = {
  hasCredentials: boolean;
  shopDomain: string | null;
  shopName: string | null;
  tokenExpiresAt: Date | null;
  connectedAt: Date | null;
  scope: string | null;
};

function encryptionKey() {
  const secret = process.env.APP_ENCRYPTION_KEY?.trim();
  if (!secret) throw new Error("APP_ENCRYPTION_KEY is not configured. Set it before saving Shopify credentials.");
  return createHash("sha256").update(secret).digest();
}

function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`;
}

function decrypt(payload: string) {
  const [version, iv, tag, encrypted] = payload.split(":");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Invalid encrypted Shopify credential.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

function isUsableToken(expiresAt: Date | null) {
  return Boolean(expiresAt && expiresAt.getTime() > Date.now() + TOKEN_REFRESH_SAFETY_MS);
}

async function getAccessToken(options?: { forceRefresh?: boolean }) {
  const settings = await getSettings();
  if (!settings.shopifyShopDomain || !settings.shopifyClientIdEncrypted || !settings.shopifyClientSecretEncrypted) {
    throw new Error("Save Shopify store credentials before connecting.");
  }
  if (!options?.forceRefresh && settings.shopifyAccessTokenEncrypted && isUsableToken(settings.shopifyTokenExpiresAt)) return decrypt(settings.shopifyAccessTokenEncrypted);

  const response = await fetch(`https://${settings.shopifyShopDomain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: decrypt(settings.shopifyClientIdEncrypted), client_secret: decrypt(settings.shopifyClientSecretEncrypted) }),
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await response.text();
  let payload: ShopifyTokenResponse = {};
  try { payload = JSON.parse(raw) as ShopifyTokenResponse; } catch { /* response message is handled below */ }
  if (!response.ok || !payload.access_token) {
    throw new Error(`Shopify token request failed (${response.status}): ${(payload.error_description ?? payload.error ?? raw).slice(0, 240)}`);
  }
  const expiresIn = Number(payload.expires_in);
  const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000) : null;
  await prisma.appSetting.update({ where: { id: settings.id }, data: { shopifyAccessTokenEncrypted: encrypt(payload.access_token), shopifyTokenExpiresAt: expiresAt, shopifyTokenScope: payload.scope ?? null } });
  return payload.access_token;
}

async function shopifyGraphql<T>(query: string, variables: Record<string, unknown>, options?: { forceTokenRefresh?: boolean }) {
  const settings = await getSettings();
  if (!settings.shopifyShopDomain) throw new Error("Save Shopify credentials before syncing a listing.");
  const response = await fetch(`https://${settings.shopifyShopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Shopify-Access-Token": await getAccessToken({ forceRefresh: options?.forceTokenRefresh }) },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = (await response.json()) as { data?: T; errors?: Array<{ message?: string }> };
  if (!response.ok || payload.errors?.[0]?.message || !payload.data) {
    throw new Error(`Shopify GraphQL request failed${payload.errors?.[0]?.message ? `: ${payload.errors[0].message}` : ` (${response.status})`}.`);
  }
  return payload.data;
}

function toHtml(text: string) {
  return `<p>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "</p><p>")}</p>`;
}

export async function createShopifyProduct(input: {
  title: string;
  description: string;
  tags: string[];
  productType: string;
  price: number;
  status: "ACTIVE" | "DRAFT" | "UNLISTED";
  publicationIds: string[];
  images: Array<{ url: string; alt: string | null }>;
}) {
  type ProductCreateResponse = { productCreate?: { product?: { id: string; handle: string | null; variants: { nodes: Array<{ id: string }> } }; userErrors: Array<{ message: string }> } };
  const created = await shopifyGraphql<ProductCreateResponse>(
    `mutation CreatePortalProduct($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
      productCreate(product: $product, media: $media) {
        product { id handle variants(first: 1) { nodes { id } } }
        userErrors { message }
      }
    }`,
    {
      product: { title: input.title, descriptionHtml: toHtml(input.description), tags: input.tags, productType: input.productType, status: input.status },
      media: input.images.map((image) => ({ originalSource: image.url, alt: image.alt ?? input.title, mediaContentType: "IMAGE" })),
    },
  );
  const createResult = created.productCreate;
  const createError = createResult?.userErrors[0]?.message;
  const product = createResult?.product;
  const variant = product?.variants.nodes[0];
  if (createError || !product || !variant) throw new Error(`Shopify product creation failed${createError ? `: ${createError}` : "."}`);

  type VariantUpdateResponse = { productVariantsBulkUpdate?: { userErrors: Array<{ message: string }> } };
  const updated = await shopifyGraphql<VariantUpdateResponse>(
    `mutation SetPortalProductPrice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { message } }
    }`,
    { productId: product.id, variants: [{ id: variant.id, price: input.price.toFixed(2) }] },
  );
  const updateError = updated.productVariantsBulkUpdate?.userErrors[0]?.message;
  if (updateError) throw new Error(`Shopify product price update failed: ${updateError}`);

  if (input.publicationIds.length > 0) {
    type PublishResponse = { publishablePublish?: { userErrors: Array<{ message: string }> } };
    const published = await shopifyGraphql<PublishResponse>(
      `mutation PublishPortalProduct($id: ID!, $input: [PublicationInput!]!) {
        publishablePublish(id: $id, input: $input) { userErrors { message } }
      }`,
      { id: product.id, input: input.publicationIds.map((publicationId) => ({ publicationId })) },
    );
    const publishError = published.publishablePublish?.userErrors[0]?.message;
    if (publishError) throw new Error(`Shopify product publishing failed: ${publishError}`);
  }

  const settings = await getSettings();
  const numericId = product.id.split("/").pop();
  return { externalListingId: product.id, externalUrl: `https://${settings.shopifyShopDomain}/admin/products/${numericId}`, message: `Shopify product created with ${input.status.toLowerCase()} status.` };
}

export async function getShopifyPublications() {
  const settings = await getSettings();
  const grantedScopes = new Set((settings.shopifyTokenScope ?? "").split(",").map((scope) => scope.trim()).filter(Boolean));
  type PublicationsResponse = { publications?: { nodes: Array<{ id: string; name: string }> } };
  const data = await shopifyGraphql<PublicationsResponse>(
    `query ShopifyPublications { publications(first: 100) { nodes { id name } } }`,
    {},
    { forceTokenRefresh: !grantedScopes.has("read_publications") },
  );
  return data.publications?.nodes ?? [];
}


export async function getShopifyIntegrationStatus(): Promise<ShopifyIntegrationStatus> {
  const settings = await getSettings();
  return {
    hasCredentials: Boolean(settings.shopifyShopDomain && settings.shopifyClientIdEncrypted && settings.shopifyClientSecretEncrypted),
    shopDomain: settings.shopifyShopDomain,
    shopName: settings.shopifyShopName,
    tokenExpiresAt: settings.shopifyTokenExpiresAt,
    connectedAt: settings.shopifyConnectedAt,
    scope: settings.shopifyTokenScope,
  };
}

export async function saveShopifyClientCredentials(input: { shopDomain: string; clientId: string; clientSecret: string }) {
  const settings = await getSettings();
  await prisma.appSetting.update({ where: { id: settings.id }, data: {
    shopifyShopDomain: input.shopDomain.trim().toLowerCase(),
    shopifyClientIdEncrypted: encrypt(input.clientId.trim()),
    shopifyClientSecretEncrypted: encrypt(input.clientSecret.trim()),
    shopifyAccessTokenEncrypted: null, shopifyTokenExpiresAt: null, shopifyTokenScope: null, shopifyConnectedAt: null, shopifyShopName: null,
  } });
}

export async function testShopifyConnection() {
  const settings = await getSettings();
  if (!settings.shopifyShopDomain) throw new Error("Save Shopify credentials before testing the connection.");
  // A Settings test is also the explicit way to verify newly granted scopes.
  // Always exchange the client credentials for a fresh token instead of using
  // a still-valid token that may have been issued before a scope change.
  const accessToken = await getAccessToken({ forceRefresh: true });
  const response = await fetch(`https://${settings.shopifyShopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Shopify-Access-Token": accessToken },
    body: JSON.stringify({ query: "query ShopifyConnection { shop { name myshopifyDomain currencyCode } }" }),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = (await response.json()) as { data?: { shop?: { name?: string; myshopifyDomain?: string; currencyCode?: string } }; errors?: Array<{ message?: string }> };
  const error = payload.errors?.[0]?.message;
  if (!response.ok || error || !payload.data?.shop?.name) throw new Error(`Shopify connection test failed${error ? `: ${error}` : ` (${response.status})`}.`);
  await prisma.appSetting.update({ where: { id: settings.id }, data: { shopifyConnectedAt: new Date(), shopifyShopName: payload.data.shop.name } });
  return payload.data.shop;
}

export async function getShopifyOnlineStoreUrl(productId: string) {
  type ProductResponse = { product?: { onlineStoreUrl: string | null } | null };
  const data = await shopifyGraphql<ProductResponse>(
    `query ShopifyProductUrl($id: ID!) { product(id: $id) { onlineStoreUrl } }`,
    { id: productId },
  );
  return data.product?.onlineStoreUrl ?? null;
}

export async function refreshShopifyListingFromRemote(listingId: string) {
  const listing = await prisma.marketplaceListing.findUnique({ where: { id: listingId } });
  if (!listing || listing.marketplaceType !== "SHOPIFY" || !listing.externalListingId) return false;

  try {
    type ProductResponse = {
      product?: {
        title: string;
        description: string;
        tags: string[];
        status: "ACTIVE" | "ARCHIVED" | "DRAFT" | "UNLISTED";
        variants: { nodes: Array<{ price: string }> };
      } | null;
    };
    const data = await shopifyGraphql<ProductResponse>(
      `query RefreshPortalListing($id: ID!) {
        product(id: $id) { title description tags status variants(first: 1) { nodes { price } } }
      }`,
      { id: listing.externalListingId },
    );
    const product = data.product;
    if (!product) throw new Error("Shopify product was not found.");
    const price = product.variants.nodes[0]?.price;
    if (!price) throw new Error("Shopify product has no default variant price.");
    await prisma.marketplaceListing.update({
      where: { id: listingId },
      data: {
        title: product.title,
        description: product.description,
        tags: product.tags,
        price,
        status: product.status === "DRAFT" ? "DRAFT" : product.status === "ARCHIVED" ? "INACTIVE" : "PUBLISHED",
        syncStatus: "IN_SYNC",
        lastSyncedAt: new Date(),
        lastSyncMessage: "Reconciled with Shopify on listing view.",
      },
    });
    return true;
  } catch (error) {
    await prisma.marketplaceListing.update({
      where: { id: listingId },
      data: {
        syncStatus: "FAILED",
        lastSyncedAt: new Date(),
        lastSyncMessage: error instanceof Error ? error.message : "Unable to refresh from Shopify.",
      },
    });
    return false;
  }
}
