import Image from "next/image";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/badge";
import { ShopifyBulkListingForm } from "@/components/admin/shopify-bulk-listing-form";
import { Table, TableContainer } from "@/components/ui/table";
import { humanizeEnum, listingStatusOptions, marketplaceTypeOptions, productStatusOptions } from "@/lib/domain";
import { getListingProductIndex } from "@/server/services/listing-service";
import { getShopifyCategoryTagForProductCategory, getShopifyCategoryTagMappings } from "@/server/services/shopify-category-tag-mapping-service";
import { calculateRequestEstimate } from "@/lib/request-estimates";
import { ListingStatus, MarketplaceType, ProductStatus } from "@/generated/prisma/client";
import { getSettings } from "@/server/services/settings-service";

const PAGE_SIZE = 24;

const marketplaceMarks: Record<MarketplaceType, { label: string; className: string }> = {
  ETSY: { label: "E", className: "bg-orange-100 text-orange-700 ring-orange-200" },
  EBAY: { label: "e", className: "bg-blue-100 text-blue-700 ring-blue-200" },
  SHOPIFY: { label: "S", className: "bg-emerald-100 text-emerald-700 ring-emerald-200" },
};

export default async function AdminListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string; marketplace?: string; status?: string; category?: string; productStatus?: string; visibility?: string; page?: string; error?: string; success?: string }>;
}) {
  const params = await searchParams;
  const view = params.view === "unlisted" || params.view === "bulk" ? params.view : "listed";
  const marketplace = marketplaceTypeOptions.includes(params.marketplace as MarketplaceType)
    ? (params.marketplace as MarketplaceType)
    : undefined;
  const status = listingStatusOptions.includes(params.status as ListingStatus) ? (params.status as ListingStatus) : undefined;
  const category = params.category === "__NONE__" ? "__NONE__" : params.category?.trim() ?? "";
  const productStatus = productStatusOptions.includes(params.productStatus as (typeof productStatusOptions)[number]) ? params.productStatus as ProductStatus : undefined;
  const visibility = params.visibility === "public" || params.visibility === "private" ? params.visibility : "";
  const requestedPage = Number(params.page);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const q = params.q?.trim() ?? "";
  const [result, shopifyCategoryMappings, settings] = await Promise.all([
    getListingProductIndex({ page, pageSize: PAGE_SIZE, view: view === "bulk" ? "unlisted" : view, search: q, marketplace, status, ...(view === "bulk" ? { category: category || undefined, productStatus, visibility: visibility || undefined } : {}) }),
    getShopifyCategoryTagMappings(),
    getSettings(),
  ]);
  const bulkProducts = result.products.map((product) => ({
    id: product.id,
    publicName: product.publicName,
    sku: product.sku,
    category: product.category,
    shortDescription: product.shortDescription,
    fullDescription: product.fullDescription,
    tags: product.tags,
    images: product.images.map((image) => ({
      id: image.id,
      imagePath: image.imagePath,
      altText: image.altText,
      isPrimary: image.isPrimary,
    })),
    suggestedCost: calculateRequestEstimate({ quantity: 1, filamentScalePercent: 100, product }).calculatedCost,
    suggestedPrice: product.pricingTier?.suggestedPrice.toString() ?? "",
    defaultCategoryTag: getShopifyCategoryTagForProductCategory(product.category, shopifyCategoryMappings),
  }));

  const makeHref = (overrides: Record<string, string | number | undefined>) => {
    const query = new URLSearchParams();
    const values = { view, q, marketplace, status, category: view === "bulk" ? category : undefined, productStatus: view === "bulk" ? productStatus : undefined, visibility: view === "bulk" ? visibility : undefined, page: result.page, ...overrides };
    Object.entries(values).forEach(([key, value]) => {
      if (value !== undefined && value !== "" && !(key === "page" && value === 1)) query.set(key, String(value));
    });
    const value = query.toString();
    return `/admin/listings${value ? `?${value}` : ""}`;
  };

  return (
    <div className="space-y-4">
      <PageHeader>
        <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Listings</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Marketplace listings</h1>
        <p className="mt-1 text-sm text-slate-600">Browse products once, then manage every storefront listing from one product workspace.</p>
      </PageHeader>

      {params.error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{params.error}</p> : null}
      {params.success ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{params.success}</p> : null}

      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        <Link href={makeHref({ view: "listed", page: 1 })} className={`rounded-t-xl px-4 py-2 text-sm font-medium ${view === "listed" ? "bg-sky-500 text-slate-950" : "text-slate-600 hover:bg-slate-100"}`}>
          Listed products
        </Link>
        <Link href={makeHref({ view: "unlisted", marketplace: undefined, status: undefined, page: 1 })} className={`rounded-t-xl px-4 py-2 text-sm font-medium ${view === "unlisted" ? "bg-sky-500 text-slate-950" : "text-slate-600 hover:bg-slate-100"}`}>
          Unlisted products
        </Link>
        <Link href={makeHref({ view: "bulk", marketplace: undefined, status: undefined, page: 1 })} className={`rounded-t-xl px-4 py-2 text-sm font-medium ${view === "bulk" ? "bg-sky-500 text-slate-950" : "text-slate-600 hover:bg-slate-100"}`}>
          Bulk list
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{view === "listed" ? "Existing listings" : view === "bulk" ? "Create Shopify listings in bulk" : "Products not listed anywhere"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action="/admin/listings" method="get" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_180px_180px_150px_auto]">
            <input type="hidden" name="view" value={view} />
            <Input name="q" defaultValue={q} placeholder="Search product, SKU, category, or tag" />
            {view === "listed" ? (
              <>
                <Select name="marketplace" defaultValue={marketplace ?? ""}>
                  <option value="">All storefronts</option>
                  {marketplaceTypeOptions.map((value) => <option key={value} value={value}>{humanizeEnum(value)}</option>)}
                </Select>
                <Select name="status" defaultValue={status ?? ""}>
                  <option value="">All listing statuses</option>
                  {listingStatusOptions.map((value) => <option key={value} value={value}>{humanizeEnum(value)}</option>)}
                </Select>
              </>
            ) : view === "bulk" ? <><Select name="category" defaultValue={category}><option value="">All categories</option><option value="__NONE__">No category selected</option>{settings.productCategories.map((value) => <option key={value} value={value}>{value}</option>)}</Select><Select name="productStatus" defaultValue={productStatus ?? ""}><option value="">All product statuses</option>{productStatusOptions.map((value) => <option key={value} value={value}>{humanizeEnum(value)}</option>)}</Select><Select name="visibility" defaultValue={visibility}><option value="">All visibility</option><option value="public">Public</option><option value="private">Private</option></Select></> : null}
            <button type="submit" className="h-10 rounded-xl bg-sky-500 px-4 text-sm font-medium text-slate-950 hover:bg-sky-400">Filter</button>
          </form>

          <p className="text-sm text-slate-500">{result.total} product{result.total === 1 ? "" : "s"} · showing {result.total === 0 ? 0 : (result.page - 1) * PAGE_SIZE + 1}–{Math.min(result.page * PAGE_SIZE, result.total)}</p>

          {view === "bulk" ? <ShopifyBulkListingForm products={bulkProducts} redirectTo={makeHref({})} /> : <TableContainer>
            <Table>
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Details</th>
                  <th className="px-3 py-2">Storefronts</th>
                  <th className="px-3 py-2">Listing status</th>
                  <th className="px-3 py-2"><span className="sr-only">Manage</span></th>
                </tr>
              </thead>
              <tbody>
                {result.products.map((product) => {
                  const activeListings = product.listings.filter((listing) => listing.status === "PUBLISHED");
                  return (
                    <tr key={product.id} className="border-b border-slate-100 align-middle">
                      <td className="px-3 py-3">
                        <Link href={`/admin/listings/${product.id}`} className="flex min-w-64 items-center gap-3 rounded-lg hover:text-sky-700">
                          {product.images[0] ? <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100"><Image src={product.images[0].imagePath} alt={product.images[0].altText ?? product.publicName} fill className="object-cover" sizes="56px" /></div> : <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-[10px] text-slate-500">No image</div>}
                          <span><span className="block font-medium text-slate-900">{product.publicName}</span><span className="block text-xs text-slate-500">{product.sku}</span></span>
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-sm text-slate-600"><p>{product.category}</p><StatusBadge value={product.status} className="mt-1" /></td>
                      <td className="px-3 py-3"><div className="flex flex-wrap gap-1.5">{product.listings.length ? product.listings.map((listing) => { const mark = marketplaceMarks[listing.marketplaceType]; return <span key={listing.id} title={humanizeEnum(listing.marketplaceType)} aria-label={humanizeEnum(listing.marketplaceType)} className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ring-1 ${mark.className}`}>{mark.label}</span>; }) : <span className="text-sm text-slate-500">Not listed</span>}</div></td>
                      <td className="px-3 py-3">{product.listings.length ? <div className="flex flex-wrap gap-1"><StatusBadge value={activeListings.length ? "PUBLISHED" : product.listings[0].status} /><span className="self-center text-xs text-slate-500">{activeListings.length} live / {product.listings.length}</span></div> : <span className="text-sm text-slate-500">—</span>}</td>
                      <td className="px-3 py-3 text-right"><Link href={`/admin/listings/${product.id}`} className="inline-flex h-8 items-center rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50">Manage</Link></td>
                    </tr>
                  );
                })}
                {result.products.length === 0 ? <tr><td colSpan={5} className="px-3 py-12 text-center text-sm text-slate-500">No products match these filters.</td></tr> : null}
              </tbody>
            </Table>
          </TableContainer>}

          {result.totalPages > 1 ? <nav className="flex items-center justify-between" aria-label="Listing pages"><p className="text-sm text-slate-500">Page {result.page} of {result.totalPages}</p><div className="flex gap-2">{result.page > 1 ? <Link href={makeHref({ page: result.page - 1 })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">Previous</Link> : null}{result.page < result.totalPages ? <Link href={makeHref({ page: result.page + 1 })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">Next</Link> : null}</div></nav> : null}
        </CardContent>
      </Card>
    </div>
  );
}
