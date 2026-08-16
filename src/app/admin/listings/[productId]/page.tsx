import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ShopifyImageSelection } from "@/components/admin/shopify-image-selection";
import { ShopifyPublishingControls } from "@/components/admin/shopify-publishing-controls";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { humanizeEnum, listingStatusOptions, shopifyCategoryTagOptions } from "@/lib/domain";
import { calculateRequestEstimate } from "@/lib/request-estimates";
import { formatCurrency } from "@/lib/utils";
import { createListingAction, runListingActionAction, updateListingAction } from "@/server/actions/portal-actions";
import { getProductByIdForAdmin } from "@/server/services/product-service";
import { getShopifyOnlineStoreUrl, refreshShopifyListingFromRemote } from "@/server/services/shopify-auth-service";

export default async function ProductListingWorkspace({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const [{ productId }, query] = await Promise.all([params, searchParams]);
  let product = await getProductByIdForAdmin(productId);
  if (!product) notFound();
  const shopifyListingIds = product.listings.filter((listing) => listing.marketplaceType === "SHOPIFY" && listing.externalListingId).map((listing) => listing.id);
  if (shopifyListingIds.length > 0) {
    await Promise.all(shopifyListingIds.map(refreshShopifyListingFromRemote));
    product = await getProductByIdForAdmin(productId);
    if (!product) notFound();
  }
  const redirectTo = `/admin/listings/${product.id}`;
  const printEstimate = calculateRequestEstimate({ quantity: 1, filamentScalePercent: 100, product });
  const publicUrls = new Map(
    await Promise.all(
      product.listings.map(async (listing) => {
        if (listing.marketplaceType !== "SHOPIFY" || !listing.externalListingId) return [listing.id, null] as const;
        try { return [listing.id, await getShopifyOnlineStoreUrl(listing.externalListingId)] as const; }
        catch { return [listing.id, null] as const; }
      }),
    ),
  );

  return <div className="space-y-4">
    <PageHeader>
      <Link href="/admin/listings" className="text-sm font-medium text-sky-700 hover:underline">← Back to listings</Link>
      <div className="mt-3 flex items-center gap-3">
        {product.images[0] ? <div className="relative h-16 w-16 overflow-hidden rounded-xl border border-slate-200"><Image src={product.images[0].imagePath} alt={product.images[0].altText ?? product.publicName} fill className="object-cover" sizes="64px" /></div> : null}
        <div><p className="text-xs uppercase tracking-[0.2em] text-sky-600">Product listing workspace</p><h1 className="mt-1 text-2xl font-semibold text-slate-900">{product.publicName}</h1><p className="mt-1 text-sm text-slate-600">{product.sku} · {product.category}</p></div>
      </div>
    </PageHeader>
    {query.error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{query.error}</p> : null}
    {query.success ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{query.success}</p> : null}

    {product.listings.length === 0 ? <Card>
      <CardHeader><CardTitle>Create Shopify listing</CardTitle><CardDescription>Create this product&apos;s first Shopify listing.</CardDescription></CardHeader>
      <CardContent>
        <div className="listing-price-estimate mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl px-4 py-3 text-sm">
          <span><span className="font-medium text-slate-900">Estimated material cost / print:</span> {printEstimate.calculatedCost === null ? "Add filament requirements and costs to calculate." : formatCurrency(printEstimate.calculatedCost)}</span>
          {printEstimate.totalWeightGrams !== null ? <span className="text-slate-500">{printEstimate.totalWeightGrams}g estimated material</span> : null}
        </div>
        <form action={createListingAction} className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <input type="hidden" name="productId" value={product.id} /><input type="hidden" name="redirectTo" value={redirectTo} /><input type="hidden" name="marketplaceType" value="SHOPIFY" />
          <label className="grid gap-1 text-sm font-medium text-slate-700">Listing title<Input name="title" defaultValue={product.publicName} required /></label>
          <input type="hidden" name="status" value="DRAFT" />
          <ShopifyPublishingControls className="md:col-span-2 xl:col-span-3 md:grid-cols-[minmax(220px,280px)_minmax(0,1fr)] md:items-start" />
          <label className="grid gap-1 text-sm font-medium text-slate-700">Shopify category tag<Select name="shopifyCategoryTag" defaultValue=""><option value="">No category tag selected</option>{shopifyCategoryTagOptions.map((option) => <option key={option.tag} value={option.tag}>{option.label}</option>)}</Select></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">Price<Input name="price" type="number" min={0.01} step="0.01" defaultValue={product.pricingTier?.suggestedPrice.toString() ?? ""} placeholder="0.00" required />{product.pricingTier ? <span className="text-xs font-normal text-slate-500">Suggested by {product.pricingTier.label}; you can adjust it for this listing.</span> : null}</label>
          <input type="hidden" name="syncStatus" value="NOT_SYNCED" />
          <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2 xl:col-span-3">Description<Textarea name="description" defaultValue={product.fullDescription || product.shortDescription} required /></label>
          <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2 xl:col-span-3">Tags <span className="font-normal text-slate-500">(comma separated)</span><Input name="tags" defaultValue={product.tags.join(", ")} /></label>
          <div className="md:col-span-2 xl:col-span-3"><ShopifyImageSelection images={product.images} /></div>
          <div className="xl:col-span-3"><Button type="submit">Create Shopify listing</Button></div>
        </form>
      </CardContent>
    </Card> : null}

    <div className="space-y-4">
      {product.listings.map((listing) => <Card key={listing.id}>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3"><div><CardTitle>{humanizeEnum(listing.marketplaceType)}</CardTitle><CardDescription>{listing.externalListingId ? `ID: ${listing.externalListingId}` : "No external ID yet"}</CardDescription></div><div className="flex gap-2"><StatusBadge value={listing.status} /><StatusBadge value={listing.syncStatus} /></div></CardHeader>
        <CardContent className="space-y-4">
          <form action={updateListingAction} className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <input type="hidden" name="listingId" value={listing.id} /><input type="hidden" name="productId" value={product.id} /><input type="hidden" name="marketplaceType" value={listing.marketplaceType} /><input type="hidden" name="redirectTo" value={redirectTo} />
            <label className="grid gap-1 text-sm font-medium text-slate-700">Listing title<Input name="title" defaultValue={listing.title} required /><span className="text-xs font-normal text-slate-500">The customer-facing name tracked for this Shopify product.</span></label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">Price<Input name="price" type="number" min={0.01} step="0.01" defaultValue={listing.price.toString()} required /><span className="text-xs font-normal text-slate-500">The tracked default-variant price, in USD.</span></label>
            <input type="hidden" name="externalListingId" value={listing.externalListingId ?? ""} /><input type="hidden" name="externalUrl" value={listing.externalUrl ?? ""} />
            <div className="grid gap-1 text-sm font-medium text-slate-700"><span>Shopify product ID</span><code className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-normal text-slate-700">{listing.externalListingId ?? "Not linked yet"}</code><span className="text-xs font-normal text-slate-500">Shopify&apos;s internal product identifier.</span></div>
            <div className="grid gap-1 text-sm font-medium text-slate-700"><span>Shopify Admin URL</span><span className="truncate rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal text-slate-600">{listing.externalUrl ?? "Not linked yet"}</span><span className="text-xs font-normal text-slate-500">Direct link to this product in Shopify Admin.</span></div>
            <label className="grid gap-1 text-sm font-medium text-slate-700">Listing status<Select name="status" defaultValue={listing.status}>{listingStatusOptions.map((value) => <option key={value} value={value}>{humanizeEnum(value)}</option>)}</Select><span className="text-xs font-normal text-slate-500">The local status used to track whether this listing should be live.</span></label>
            <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2 xl:col-span-3">Description<Textarea name="description" defaultValue={listing.description} required /><span className="text-xs font-normal text-slate-500">The customer-facing description tracked for this Shopify product.</span></label>
            <label className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2">Tags<Input name="tags" defaultValue={listing.tags.join(", ")} /><span className="text-xs font-normal text-slate-500">Comma-separated keywords used for Shopify search, filtering, and collections.</span></label><input type="hidden" name="syncStatus" value={listing.syncStatus} />
            <div className="xl:col-span-3"><Button type="submit">Save changes</Button></div>
          </form>
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            {(["publish", "update", "refresh", "remove"] as const).map((action) => <form action={runListingActionAction} key={action}><input type="hidden" name="listingId" value={listing.id} /><input type="hidden" name="action" value={action} /><input type="hidden" name="redirectTo" value={redirectTo} /><Button type="submit" size="sm" variant={action === "remove" ? "danger" : "secondary"}>{action === "refresh" ? "Refresh status" : humanizeEnum(action)}</Button></form>)}
            {listing.externalUrl ? <a href={listing.externalUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-xl px-3 text-xs font-medium text-sky-700 hover:bg-sky-50">Open in Shopify Admin ↗</a> : null}
            {publicUrls.get(listing.id) ? <a href={publicUrls.get(listing.id) ?? undefined} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-xl px-3 text-xs font-medium text-sky-700 hover:bg-sky-50">View storefront product ↗</a> : null}
          </div>
        </CardContent>
      </Card>)}
    </div>
  </div>;
}
