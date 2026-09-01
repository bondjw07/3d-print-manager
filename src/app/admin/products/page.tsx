import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowUp, DollarSign, ExternalLink, Folder, Paperclip, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/badge";
import { SelectAllFormCheckbox } from "@/components/ui/select-all-form-checkbox";
import { Table, TableContainer } from "@/components/ui/table";
import { DismissibleDetails } from "@/components/ui/dismissible-details";
import { ProductImportsDropdown } from "@/components/forms/product-imports-dropdown";
import { BulkPricingTierSelector } from "@/components/admin/bulk-pricing-tier-selector";
import { HoverInfo } from "@/components/ui/hover-info";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { humanizeEnum, productStatusOptions } from "@/lib/domain";
import { calculateRequestEstimate } from "@/lib/request-estimates";
import { getManagedCreators } from "@/server/services/creator-service";
import { getAdminProducts } from "@/server/services/product-service";
import { getSettings } from "@/server/services/settings-service";
import { getPricingTiers } from "@/server/services/pricing-tier-service";
import {
  bulkUpdateProductControlsAction,
} from "@/server/actions/portal-actions";

const productSortFields = ["product", "sku", "status", "visibility", "requestable", "tier", "estimatedCost", "inventory", "updated"] as const;
type ProductSortField = (typeof productSortFields)[number];

function formatPrintDuration(totalSeconds: number | null) {
  if (totalSeconds === null || totalSeconds < 0) return "Not provided";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function getBambuBuddyFileManagerUrl(baseUrl: string | null) {
  if (!baseUrl?.trim()) return null;

  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/files`;
    return url.toString();
  } catch {
    return null;
  }
}

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string; category?: string; status?: string; visibility?: string; bambuBuddy?: string; creator?: string; pricingTier?: string; sort?: string; direction?: string; error?: string; success?: string }>;
}) {
  const params = await searchParams;
  const view = params.view === "bulk" || params.view === "imports" ? params.view : "catalog";
  const q = params.q?.trim() ?? "";
  const category = params.category === "__NONE__" ? "__NONE__" : params.category?.trim() ?? "";
  const status = productStatusOptions.includes(params.status as (typeof productStatusOptions)[number]) ? params.status! : "";
  const visibility = params.visibility === "public" || params.visibility === "private" ? params.visibility : "";
  const bambuBuddy = params.bambuBuddy === "linked" || params.bambuBuddy === "unlinked" ? params.bambuBuddy : "";
  const creatorId = params.creator?.trim() ?? "";
  const pricingTierParam = params.pricingTier?.trim() ?? "";
  const sort = productSortFields.includes(params.sort as ProductSortField) ? params.sort as ProductSortField : null;
  const direction = params.direction === "desc" ? "desc" : "asc";
  const [allProducts, creators, settings, pricingTiers] = await Promise.all([getAdminProducts(q || undefined), getManagedCreators(), getSettings(), getPricingTiers()]);
  const selectedCreator = creators.find((creator) => creator.id === creatorId);
  const pricingTier = pricingTierParam === "__NONE__" || pricingTiers.some((tier) => tier.id === pricingTierParam) ? pricingTierParam : "";
  const pricingTiersByCategory = pricingTiers.reduce<Record<string, typeof pricingTiers>>((tiersByCategory, tier) => {
    (tiersByCategory[tier.category] ??= []).push(tier);
    return tiersByCategory;
  }, {});
  const activeFilterCount = [category, status, visibility, bambuBuddy, selectedCreator, pricingTier].filter(Boolean).length;
  const redirectQuery = new URLSearchParams({ view, ...(q ? { q } : {}), ...(category ? { category } : {}), ...(status ? { status } : {}), ...(visibility ? { visibility } : {}), ...(bambuBuddy ? { bambuBuddy } : {}), ...(selectedCreator ? { creator: selectedCreator.id } : {}), ...(pricingTier ? { pricingTier } : {}), ...(sort ? { sort, direction } : {}) });
  const redirectTo = `/admin/products?${redirectQuery}`;
  const filteredProducts = allProducts.filter((product) => {
    const hasManagedCategory = settings.productCategories.includes(product.category);
    const matchesCategory = !category || (category === "__NONE__" ? !product.category.trim() || !hasManagedCategory : product.category === category);
    const matchesCreator = !selectedCreator || product.importSourceCreatorName?.trim().toLowerCase() === selectedCreator.name.trim().toLowerCase();
    const matchesPricingTier = !pricingTier || (pricingTier === "__NONE__" ? !product.pricingTierId : product.pricingTierId === pricingTier);
    const isBambuBuddyLinked = Boolean(product.bambuBuddyFileId?.trim());
    const matchesBambuBuddy = !bambuBuddy || isBambuBuddyLinked === (bambuBuddy === "linked");
    return matchesCategory && matchesCreator && matchesPricingTier && matchesBambuBuddy && (!status || product.status === status) && (!visibility || product.isPublic === (visibility === "public"));
  });
  const products = [...filteredProducts].sort((left, right) => {
    if (!sort) {
      return right.createdAt.getTime() - left.createdAt.getTime();
    }

    const valueFor = (product: typeof filteredProducts[number]) => {
      switch (sort) {
        case "product": return product.publicName;
        case "sku": return product.sku;
        case "status": return product.status;
        case "visibility": return Number(product.isPublic);
        case "requestable": return Number(product.isRequestable);
        case "tier": return product.pricingTier?.label ?? "";
        case "estimatedCost": return calculateRequestEstimate({ quantity: 1, filamentScalePercent: 100, product: { ...product, defaultFilamentSpoolCost: settings.defaultFilamentSpoolCost } }).calculatedCost ?? -1;
        case "inventory": return product.inventoryRecord?.available ?? -1;
        case "updated": return product.updatedAt.getTime();
      }
    };
    const leftValue = valueFor(left);
    const rightValue = valueFor(right);
    const comparison = typeof leftValue === "string" && typeof rightValue === "string"
      ? leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: "base" })
      : Number(leftValue) - Number(rightValue);

    return direction === "desc" ? -comparison : comparison;
  });
  const sortHref = (field: ProductSortField) => {
    const nextDirection = sort === field && direction === "asc" ? "desc" : "asc";
    const query = new URLSearchParams({ view, ...(q ? { q } : {}), ...(category ? { category } : {}), ...(status ? { status } : {}), ...(visibility ? { visibility } : {}), ...(bambuBuddy ? { bambuBuddy } : {}), ...(selectedCreator ? { creator: selectedCreator.id } : {}), ...(pricingTier ? { pricingTier } : {}), sort: field, direction: nextDirection });
    return `/admin/products?${query}`;
  };
  const clearFiltersHref = `/admin/products?${new URLSearchParams({ view, ...(q ? { q } : {}), ...(sort ? { sort, direction } : {}) })}`;
  const productListQuery = redirectQuery.toString();
  const productDetailHref = (productId: string) => `/admin/products/${productId}?${new URLSearchParams({ list: productListQuery })}`;
  const sortableHeader = (label: string, field: ProductSortField) => {
    const isSorted = sort === field;
    const SortIcon = isSorted && direction === "desc" ? ArrowDown : ArrowUp;
    return <th className="px-2 py-2" aria-sort={isSorted ? (direction === "asc" ? "ascending" : "descending") : "none"}>
      <Link href={sortHref(field)} className="inline-flex items-center gap-1 rounded text-left hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500">
        {label}<SortIcon className={`h-3.5 w-3.5 ${isSorted ? "text-sky-600" : "text-slate-400"}`} aria-hidden />
      </Link>
    </th>;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>{view === "imports" ? "Imports" : "Product Catalog"}</CardTitle>
            <p className="text-sm text-slate-500">
              {view === "imports"
                ? "Start imports from one place. Supported today: Thangs URLs, MyMiniFactory URLs, creator discovery, product CSV uploads, and filament-weight CSV updates."
                : "Manage product data, visibility, and lifecycle status."}
            </p>
          </div>
          {view !== "imports" ? (
            <Link href="/admin/products/new">
              <Button>Create Product</Button>
            </Link>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3">
          {params.error ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{params.error}</p>
          ) : null}
          {params.success ? (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {params.success}
            </p>
          ) : null}

          <div className="flex gap-2 border-b border-slate-200">
            <Link href="/admin/products" className={`rounded-t-xl px-4 py-2 text-sm font-medium ${view === "catalog" ? "bg-sky-500 text-slate-950" : "text-slate-600 hover:bg-slate-100"}`}>Product catalog</Link>
            <Link href="/admin/products?view=bulk" className={`rounded-t-xl px-4 py-2 text-sm font-medium ${view === "bulk" ? "bg-sky-500 text-slate-950" : "text-slate-600 hover:bg-slate-100"}`}>Bulk update</Link>
            <Link href="/admin/products?view=imports" className={`rounded-t-xl px-4 py-2 text-sm font-medium ${view === "imports" ? "bg-sky-500 text-slate-950" : "text-slate-600 hover:bg-slate-100"}`}>Imports</Link>
          </div>

          {view === "imports" ? <ProductImportsDropdown /> : <>
          <form className="space-y-2" action="/admin/products" method="get">
            <input type="hidden" name="view" value={view} />
            {sort ? <><input type="hidden" name="sort" value={sort} /><input type="hidden" name="direction" value={direction} /></> : null}
            <div className="flex flex-wrap gap-2">
              <Input name="q" defaultValue={q} placeholder="Search by internal name, public name, or SKU" className="min-w-64 flex-1" />
              <DismissibleDetails defaultOpen={activeFilterCount > 0} className="group relative">
                <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                  <SlidersHorizontal className="h-4 w-4" aria-hidden />
                  Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
                </summary>
                <div className="absolute right-0 z-10 mt-2 grid w-72 gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-lg sm:w-96 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                    Category
                    <Select name="category" defaultValue={category}>
                      <option value="">All categories</option>
                      <option value="__NONE__">No category selected</option>
                      {settings.productCategories.map((value) => <option key={value} value={value}>{value}</option>)}
                    </Select>
                  </label>
                  <label className="grid gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                    Status
                    <Select name="status" defaultValue={status}>
                      <option value="">All statuses</option>
                      {productStatusOptions.map((value) => <option key={value} value={value}>{humanizeEnum(value)}</option>)}
                    </Select>
                  </label>
                  <label className="grid gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                    Visibility
                    <Select name="visibility" defaultValue={visibility}>
                      <option value="">All visibility</option>
                      <option value="public">Public</option>
                      <option value="private">Private</option>
                    </Select>
                  </label>
                  <label className="grid gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                    BamBuddy file
                    <Select name="bambuBuddy" defaultValue={bambuBuddy}>
                      <option value="">All products</option>
                      <option value="linked">Linked</option>
                      <option value="unlinked">Not linked</option>
                    </Select>
                  </label>
                  <label className="grid gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                    Creator
                    <Select name="creator" defaultValue={selectedCreator?.id ?? ""}>
                      <option value="">All creators</option>
                      {creators.map((creator) => <option key={creator.id} value={creator.id}>{creator.name}</option>)}
                    </Select>
                  </label>
                  <label className="grid gap-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                    Price tier
                    <Select name="pricingTier" defaultValue={pricingTier}>
                      <option value="">All price tiers</option>
                      <option value="__NONE__">No price tier</option>
                      {Object.entries(pricingTiersByCategory).map(([tierCategory, tiers]) => <optgroup key={tierCategory} label={tierCategory}>{tiers.map((tier) => <option key={tier.id} value={tier.id}>{tier.label}</option>)}</optgroup>)}
                    </Select>
                  </label>
                  <div className="flex items-end justify-end gap-2">
                    {activeFilterCount > 0 ? <Link href={clearFiltersHref} className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900">Clear</Link> : null}
                    <Button type="submit" size="sm">Apply filters</Button>
                  </div>
                </div>
              </DismissibleDetails>
              <Button type="submit" variant="secondary">Search</Button>
            </div>
          </form>

          {view === "bulk" ? <form
            id="bulk-product-update-form"
            action={bulkUpdateProductControlsAction}
            className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
          >
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="max-w-3xl text-sm text-slate-700">
                Bulk update selected products. Choose only the fields you want to change and leave the rest set to keep current.
              </p>
              <Button type="submit" className="shrink-0">
                Apply To Selected
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor="bulkCategory">
                  Category
                </label>
                <Select id="bulkCategory" name="category" defaultValue="UNCHANGED">
                  <option value="UNCHANGED">Keep current category</option>
                  {settings.productCategories.map((value) => <option key={value} value={value}>Set to {value}</option>)}
                </Select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor="bulkStatus">
                  Status
                </label>
                <Select id="bulkStatus" name="status" defaultValue="UNCHANGED">
                  <option value="UNCHANGED">Keep current status</option>
                  <option value="ACTIVE">{humanizeEnum("ACTIVE")}</option>
                  <option value="ARCHIVED">{humanizeEnum("ARCHIVED")}</option>
                </Select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor="bulkVisibility">
                  Visibility
                </label>
                <Select id="bulkVisibility" name="isPublic" defaultValue="UNCHANGED">
                  <option value="UNCHANGED">Keep visibility</option>
                  <option value="true">Set public</option>
                  <option value="false">Set private</option>
                </Select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor="bulkRequestable">
                  Requestable
                </label>
                <Select id="bulkRequestable" name="isRequestable" defaultValue="UNCHANGED">
                  <option value="UNCHANGED">Keep requestable</option>
                  <option value="true">Set requestable</option>
                  <option value="false">Set not requestable</option>
                </Select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor="bulkCreatorSelection">
                  Creator
                </label>
                <Select id="bulkCreatorSelection" name="creatorSelection" defaultValue="UNCHANGED">
                  <option value="UNCHANGED">Keep creator</option>
                  <option value="CLEAR">Clear creator</option>
                  {creators.length > 0 ? <option disabled>----------</option> : null}
                  {creators.length === 0 ? (
                    <option value="" disabled>
                      No managed creators yet
                    </option>
                  ) : null}
                  {creators.map((creator) => (
                    <option key={creator.id} value={creator.id}>
                      Set to {creator.name}
                    </option>
                  ))}
                </Select>
                {creators.length === 0 ? (
                  <p className="mt-1 text-xs text-amber-700">Add creators in Settings to bulk assign creator values.</p>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">Choose a managed creator to apply across selected products.</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor="bulkTagsToAdd">
                  Add tags
                </label>
                <Input id="bulkTagsToAdd" name="tagsToAdd" placeholder="Seasonal, fantasy" />
                <p className="mt-1 text-xs text-slate-500">Comma-separated. Existing tags are kept and duplicates are skipped.</p>
              </div>
              <BulkPricingTierSelector tiers={pricingTiers.map((tier) => ({ id: tier.id, category: tier.category, label: tier.label }))} />
            </div>
          </form> : null}

          <TableContainer>
            <Table>
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  {view === "bulk" ? <th className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      <SelectAllFormCheckbox
                        formId="bulk-product-update-form"
                        inputName="productIds"
                        totalCount={products.length}
                        ariaLabel="Select all products"
                      />
                      <span className="sr-only">Select</span>
                    </div>
                  </th> : null}
                  <th className="px-2 py-2">Thumb</th>
                  {sortableHeader("Product", "product")}
                  {sortableHeader("SKU", "sku")}
                  {sortableHeader("Status", "status")}
                  {sortableHeader("Visibility", "visibility")}
                  {sortableHeader("Requestable", "requestable")}
                  {view === "bulk" ? <>{sortableHeader("Tier", "tier")}{sortableHeader("Est. cost", "estimatedCost")}</> : null}
                  {sortableHeader("Inventory", "inventory")}
                  {sortableHeader("Updated", "updated")}
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} data-bulk-product-row={view === "bulk" ? "" : undefined} data-bulk-product-category={view === "bulk" ? product.category : undefined} className="border-b border-slate-100 hover:bg-slate-50">
                    {view === "bulk" ? <td className="px-2 py-3">
                      <input
                        type="checkbox"
                        name="productIds"
                        value={product.id}
                        form="bulk-product-update-form"
                        className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                        aria-label={`Select ${product.publicName}`}
                      />
                    </td> : null}
                    <td className="px-0 py-0">
                      <Link href={productDetailHref(product.id)} className="block px-2 py-3">
                        {product.images[0] ? (
                          <div className="relative h-14 w-14 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                            <Image
                              src={product.images[0].imagePath}
                              alt={product.publicName}
                              fill
                              className="object-cover"
                            />
                          </div>
                        ) : (
                          <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-[10px] text-slate-500">
                            No Image
                          </div>
                        )}
                      </Link>
                    </td>
                    <td className="px-0 py-0">
                      <div className="px-2 py-3">
                        <div className="flex items-center gap-1.5"><Link href={productDetailHref(product.id)} className="font-medium text-slate-900 hover:underline">{product.publicName}</Link>{product.bambuBuddyFileId?.trim() ? <HoverInfo content={<><p className="font-semibold text-slate-900">BamBuddy file linked</p><dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-slate-600"><dt>Print time</dt><dd>{formatPrintDuration(product.bambuBuddyPrintTimeSeconds)}</dd><dt>Filament</dt><dd>{product.bambuBuddyFilamentUsedGrams === null ? "Not provided" : `${product.bambuBuddyFilamentUsedGrams.toString()} g`}</dd><dt>Est. cost</dt><dd>{(() => { const estimate = calculateRequestEstimate({ quantity: 1, filamentScalePercent: 100, product: { ...product, defaultFilamentSpoolCost: settings.defaultFilamentSpoolCost } }); return estimate.calculatedCost === null ? "Not available" : formatCurrency(estimate.calculatedCost); })()}</dd></dl></>}>{getBambuBuddyFileManagerUrl(settings.bambuBuddyBaseUrl) ? <a href={getBambuBuddyFileManagerUrl(settings.bambuBuddyBaseUrl)!} target="_blank" rel="noreferrer" className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100" aria-label="Open BamBuddy file in a new tab"><Paperclip className="h-3 w-3" aria-hidden /></a> : <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-600" aria-label="BamBuddy file linked"><Paperclip className="h-3 w-3" aria-hidden /></span>}</HoverInfo> : null}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs"><span className="text-slate-500">{product.internalName}</span><HoverInfo content={<><p className="font-semibold text-slate-900">Category</p><p className="mt-0.5 text-slate-600">{product.category}</p></>}><span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-slate-600" aria-label={`Category: ${product.category}`}><Folder className="h-3 w-3" aria-hidden /></span></HoverInfo>{product.pricingTier ? <HoverInfo content={<><p className="font-semibold text-slate-900">{product.pricingTier.label}</p><p className="mt-0.5 text-slate-600">Suggested listing price: {formatCurrency(Number(product.pricingTier.suggestedPrice))}</p><p className="mt-0.5 text-slate-500">{product.pricingTier.category}</p></>}><span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-violet-100 text-violet-700" aria-label={`Pricing tier: ${product.pricingTier.label}`}><DollarSign className="h-3 w-3" aria-hidden /></span></HoverInfo> : null}{product.tags.map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{tag}</span>)}</div>
                      </div>
                    </td>
                    <td className="px-0 py-0">
                      {product.importSourceUrl?.trim() ? <a href={product.importSourceUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-2 py-3 text-sm text-slate-600 hover:underline">{product.sku}<ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden /></a> : <Link href={productDetailHref(product.id)} className="block px-2 py-3 text-sm text-slate-600">{product.sku}</Link>}
                    </td>
                    <td className="px-0 py-0">
                      <Link href={productDetailHref(product.id)} className="block px-2 py-3">
                        <StatusBadge value={product.status} />
                      </Link>
                    </td>
                    <td className="px-0 py-0">
                      <Link href={productDetailHref(product.id)} className="block px-2 py-3 text-sm text-slate-700">
                        {product.isPublic ? "Public" : "Private"}
                      </Link>
                    </td>
                    <td className="px-0 py-0">
                      <Link href={productDetailHref(product.id)} className="block px-2 py-3 text-sm text-slate-700">
                        {product.isRequestable ? "Yes" : "No"}
                      </Link>
                    </td>
                    {view === "bulk" ? <><td className="px-0 py-0"><Link href={productDetailHref(product.id)} className="block px-2 py-3 text-xs text-slate-600">{product.pricingTier?.label ?? "No tier"}</Link></td><td className="px-0 py-0"><Link href={productDetailHref(product.id)} className="block px-2 py-3 text-xs text-slate-600">{(() => { const estimate = calculateRequestEstimate({ quantity: 1, filamentScalePercent: 100, product: { ...product, defaultFilamentSpoolCost: settings.defaultFilamentSpoolCost } }); return estimate.calculatedCost === null ? "—" : formatCurrency(estimate.calculatedCost); })()}</Link></td></> : null}
                    <td className="px-0 py-0">
                      <Link href={productDetailHref(product.id)} className="block px-2 py-3 text-sm text-slate-600">
                        {product.inventoryRecord ? `${product.inventoryRecord.available} available` : "No record"}
                      </Link>
                    </td>
                    <td className="px-0 py-0">
                      <Link href={productDetailHref(product.id)} className="block px-2 py-3 text-xs text-slate-500">
                        {formatDateTime(product.updatedAt)}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableContainer>
          </>}
        </CardContent>
      </Card>
    </div>
  );
}
