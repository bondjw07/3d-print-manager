import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ProductPhotoCarousel } from "@/components/admin/product-photo-carousel";
import { ProductForm } from "@/components/forms/product-form";
import { ImageUploadForm } from "@/components/forms/image-upload-form";
import { Button } from "@/components/ui/button";
import { ConfirmSubmitModalButton } from "@/components/ui/confirm-submit-modal-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TableContainer } from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import { humanizeEnum, productStatusOptions } from "@/lib/domain";
import { DEFAULT_SCALE_PERCENT } from "@/lib/request-scale";
import { calculateRequestEstimate } from "@/lib/request-estimates";
import { prisma } from "@/lib/prisma";
import {
  addProductInventoryAction,
  addProductFilamentRequirementAction,
  deleteProductAction,
  deleteProductImageAction,
  guessProductFilamentRequirementsAction,
  importBambuBuddyProductDataAction,
  removeProductFilamentRequirementAction,
  refreshProductFromUrlAction,
  setProductStatusAction,
  setPrimaryImageAction,
  updateInventoryAction,
  updateProductAction,
} from "@/server/actions/portal-actions";
import { getManagedCreators } from "@/server/services/creator-service";
import { getAdminProducts, getProductByIdForAdmin } from "@/server/services/product-service";
import { getSettings } from "@/server/services/settings-service";
import { getPricingTiers } from "@/server/services/pricing-tier-service";

const productSortFields = ["product", "sku", "status", "visibility", "requestable", "tier", "estimatedCost", "inventory", "updated"] as const;
type ProductSortField = (typeof productSortFields)[number];

export default async function ProductDetailAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string; list?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const product = await getProductByIdForAdmin(id);

  if (!product) {
    notFound();
  }

  const listParams = new URLSearchParams(query.list ?? "");
  const listSearch = listParams.get("q")?.trim() ?? "";
  const listCategory = listParams.get("category") === "__NONE__" ? "__NONE__" : listParams.get("category")?.trim() ?? "";
  const listStatusValue = listParams.get("status");
  const listStatus = productStatusOptions.includes(listStatusValue as (typeof productStatusOptions)[number]) ? listStatusValue! : "";
  const listVisibility = listParams.get("visibility") === "public" || listParams.get("visibility") === "private" ? listParams.get("visibility")! : "";
  const listCreatorId = listParams.get("creator")?.trim() ?? "";
  const listPricingTierParam = listParams.get("pricingTier")?.trim() ?? "";
  const listSort = productSortFields.includes(listParams.get("sort") as ProductSortField) ? listParams.get("sort") as ProductSortField : null;
  const listDirection = listParams.get("direction") === "desc" ? "desc" : "asc";
  const [filaments, creators, settings, pricingTiers, allProducts] = await Promise.all([
    prisma.filament.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
    getManagedCreators(),
    getSettings(),
    getPricingTiers(),
    getAdminProducts(listSearch || undefined),
  ]);

  const selectedListCreator = creators.find((creator) => creator.id === listCreatorId);
  const listPricingTier = listPricingTierParam === "__NONE__" || pricingTiers.some((tier) => tier.id === listPricingTierParam) ? listPricingTierParam : "";
  const orderedProducts = allProducts
    .filter((candidate) => {
      const hasManagedCategory = settings.productCategories.includes(candidate.category);
      const matchesCategory = !listCategory || (listCategory === "__NONE__" ? !candidate.category.trim() || !hasManagedCategory : candidate.category === listCategory);
      const matchesCreator = !selectedListCreator || candidate.importSourceCreatorName?.trim().toLowerCase() === selectedListCreator.name.trim().toLowerCase();
      const matchesPricingTier = !listPricingTier || (listPricingTier === "__NONE__" ? !candidate.pricingTierId : candidate.pricingTierId === listPricingTier);
      return matchesCategory && matchesCreator && matchesPricingTier && (!listStatus || candidate.status === listStatus) && (!listVisibility || candidate.isPublic === (listVisibility === "public"));
    })
    .sort((left, right) => {
      if (!listSort) {
        return 0;
      }

      const valueFor = (candidate: typeof allProducts[number]) => {
        switch (listSort) {
          case "product": return candidate.publicName;
          case "sku": return candidate.sku;
          case "status": return candidate.status;
          case "visibility": return Number(candidate.isPublic);
          case "requestable": return Number(candidate.isRequestable);
          case "tier": return candidate.pricingTier?.label ?? "";
          case "estimatedCost": return calculateRequestEstimate({ quantity: 1, filamentScalePercent: 100, product: candidate }).calculatedCost ?? -1;
          case "inventory": return candidate.inventoryRecord?.available ?? -1;
          case "updated": return candidate.updatedAt.getTime();
        }
      };
      const leftValue = valueFor(left);
      const rightValue = valueFor(right);
      const comparison = typeof leftValue === "string" && typeof rightValue === "string"
        ? leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: "base" })
        : Number(leftValue) - Number(rightValue);
      return listDirection === "desc" ? -comparison : comparison;
    });
  const currentProductIndex = orderedProducts.findIndex((candidate) => candidate.id === product.id);
  const previousProduct = currentProductIndex > 0 ? orderedProducts[currentProductIndex - 1] : null;
  const nextProduct = currentProductIndex >= 0 && currentProductIndex < orderedProducts.length - 1 ? orderedProducts[currentProductIndex + 1] : null;
  const detailHref = (productId: string) => `/admin/products/${productId}?${new URLSearchParams({ list: query.list ?? "" })}`;
  const detailRedirectTo = query.list ? detailHref(product.id) : `/admin/products/${product.id}`;

  const normalizedProductCreatorName = product.importSourceCreatorName?.trim().toLowerCase();
  const currentManagedCreatorId =
    normalizedProductCreatorName
      ? creators.find((creator) => creator.name.trim().toLowerCase() === normalizedProductCreatorName)?.id ?? null
      : null;

  const sourceUrlFromNotes = product.productionNotes
    ?.split("\n")
    .find((line) => line.startsWith("Imported URL: "))
    ?.replace("Imported URL: ", "")
    .trim();
  const sourceUrl = product.importSourceUrl || sourceUrlFromNotes || "";
  const filamentRequirements = [...product.filamentRequirements].sort((a, b) =>
    a.filament.name.localeCompare(b.filament.name),
  );
  const inventoryRecord = product.inventoryRecord;
  const onHand = inventoryRecord?.onHand ?? 0;
  const available = inventoryRecord?.available ?? 0;
  const reserved = inventoryRecord?.reserved ?? 0;
  const committed = inventoryRecord?.committed ?? 0;
  const reorderThreshold = inventoryRecord?.reorderThreshold ?? "";
  const linkedRequestCount = product._count.requests;
  const linkedQueueCount = product._count.queueItems;
  const hasLinkedWork = linkedRequestCount > 0 || linkedQueueCount > 0;
  const carouselImages = product.images.map((image) => ({
    id: image.id,
    imagePath: image.imagePath,
    altText: image.altText,
    isPrimary: image.isPrimary,
  }));

  return (
    <div className="space-y-4">
      <PageHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Product Detail</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">{product.publicName}</h1>
            <p className="mt-1 text-sm text-slate-600">SKU: {product.sku}</p>
          </div>
          {query.list && currentProductIndex >= 0 ? <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="hidden sm:inline">{currentProductIndex + 1} of {orderedProducts.length}</span>
            {previousProduct ? <Link href={detailHref(previousProduct.id)} className="rounded-lg border border-slate-300 p-2 text-slate-700 hover:bg-slate-100" aria-label="Previous product" title="Previous product"><ArrowLeft className="h-4 w-4" aria-hidden /></Link> : <span className="rounded-lg border border-slate-200 p-2 text-slate-300" aria-hidden><ArrowLeft className="h-4 w-4" /></span>}
            {nextProduct ? <Link href={detailHref(nextProduct.id)} className="rounded-lg border border-slate-300 p-2 text-slate-700 hover:bg-slate-100" aria-label="Next product" title="Next product"><ArrowRight className="h-4 w-4" aria-hidden /></Link> : <span className="rounded-lg border border-slate-200 p-2 text-slate-300" aria-hidden><ArrowRight className="h-4 w-4" /></span>}
          </div> : null}
        </div>
      </PageHeader>

      {query.error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{query.error}</p>
      ) : null}
      {query.success ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{query.success}</p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Edit Product</CardTitle>
            <CardDescription>Update core catalog data, visibility, and production notes.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProductForm
              product={product}
              creators={creators}
              categoryOptions={settings.productCategories}
              pricingTiers={pricingTiers}
              currentManagedCreatorId={currentManagedCreatorId}
              action={updateProductAction}
              bambuBuddyImportAction={importBambuBuddyProductDataAction}
              redirectTo={detailRedirectTo}
              submitLabel="Save Product"
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Photo Preview</CardTitle>
              <CardDescription>Cycle through all product photos from the primary image.</CardDescription>
            </CardHeader>
            <CardContent>
              <ProductPhotoCarousel images={carouselImages} productName={product.publicName} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Inventory</CardTitle>
              <CardDescription>Add newly printed stock and update inventory controls for this product.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                <p>
                  On hand <span className="font-semibold text-slate-900">{onHand}</span>
                </p>
                <p>
                  Available <span className="font-semibold text-slate-900">{available}</span>
                </p>
                <p>
                  Reserved <span className="font-semibold text-slate-900">{reserved}</span>
                </p>
                <p>
                  Committed <span className="font-semibold text-slate-900">{committed}</span>
                </p>
              </div>
              <form action={addProductInventoryAction} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="productId" value={product.id} />
                <input type="hidden" name="redirectTo" value={`/admin/products/${product.id}`} />
                <div>
                  <label
                    className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500"
                    htmlFor="inventoryQuantity"
                  >
                    Quantity To Add
                  </label>
                  <Input id="inventoryQuantity" name="quantity" type="number" min={1} defaultValue={1} required />
                </div>
                <div>
                  <label
                    className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500"
                    htmlFor="inventoryPrintedScalePercent"
                  >
                    Printed Scale (%)
                  </label>
                  <Input
                    id="inventoryPrintedScalePercent"
                    name="printedScalePercent"
                    type="number"
                    min={10}
                    max={400}
                    step="0.01"
                    defaultValue={DEFAULT_SCALE_PERCENT}
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <Button type="submit" variant="secondary">
                    Add To Inventory
                  </Button>
                </div>
              </form>
              <div className="border-t border-slate-200 pt-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Edit Inventory Fields</p>
                <form action={updateInventoryAction} className="grid gap-2 sm:grid-cols-4">
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="redirectTo" value={`/admin/products/${product.id}`} />
                  <div>
                    <label
                      className="mb-1 flex h-10 items-end text-xs font-medium uppercase tracking-wide leading-tight text-slate-500"
                      htmlFor="inventoryOnHand"
                    >
                      On Hand
                    </label>
                    <Input id="inventoryOnHand" name="onHand" type="number" defaultValue={onHand} />
                  </div>
                  <div>
                    <label
                      className="mb-1 flex h-10 items-end text-xs font-medium uppercase tracking-wide leading-tight text-slate-500"
                      htmlFor="inventoryReserved"
                    >
                      Reserved
                    </label>
                    <Input id="inventoryReserved" name="reserved" type="number" defaultValue={reserved} />
                  </div>
                  <div>
                    <label
                      className="mb-1 flex h-10 items-end text-xs font-medium uppercase tracking-wide leading-tight text-slate-500"
                      htmlFor="inventoryCommitted"
                    >
                      Committed
                    </label>
                    <Input id="inventoryCommitted" name="committed" type="number" defaultValue={committed} />
                  </div>
                  <div>
                    <label
                      className="mb-1 flex h-10 items-end text-xs font-medium uppercase tracking-wide leading-tight text-slate-500"
                      htmlFor="inventoryReorderThreshold"
                    >
                      Reorder Threshold
                    </label>
                    <Input id="inventoryReorderThreshold" name="reorderThreshold" type="number" defaultValue={reorderThreshold} />
                  </div>
                  <div className="sm:col-span-4">
                    <Button type="submit" variant="secondary">
                      Save Inventory Fields
                    </Button>
                  </div>
                </form>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Lifecycle</CardTitle>
              <CardDescription>Archive or reactivate this product.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <StatusBadge value={product.status} />
                <form action={setProductStatusAction}>
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="status" value={product.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE"} />
                  <input type="hidden" name="redirectTo" value={`/admin/products/${product.id}`} />
                  <Button type="submit" variant={product.status === "ACTIVE" ? "danger" : "success"}>
                    {product.status === "ACTIVE" ? "Archive Product" : "Set Product Active"}
                  </Button>
                </form>
              </div>
              <p className="text-sm text-slate-600">
                Archived products remain in admin records but are excluded from active/public workflows.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Source Refresh</CardTitle>
              <CardDescription>
                Update this product from its import source URL and merge in any missing images.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-1 text-xs text-slate-500">
                <p>
                  Source: {product.importSource ? humanizeEnum(product.importSource) : "Not linked yet"}
                  {product.importSourceReferenceId ? ` • ID ${product.importSourceReferenceId}` : ""}
                </p>
              </div>
              <form action={refreshProductFromUrlAction} className="grid gap-3">
                <input type="hidden" name="productId" value={product.id} />
                <input type="hidden" name="redirectTo" value={`/admin/products/${product.id}`} />
                <Input
                  name="sourceUrl"
                  type="url"
                  defaultValue={sourceUrl}
                  placeholder="https://thangs.com/... or https://www.myminifactory.com/object/..."
                  required
                />
                <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                  <Select name="importImages" defaultValue="true">
                    <option value="true">Import images (skip duplicate files)</option>
                    <option value="false">Refresh text only</option>
                  </Select>
                  <Button type="submit" variant="secondary">
                    Update From Source URL
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Image Library</CardTitle>
              <CardDescription>Upload product photos and assign a primary image.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ImageUploadForm productId={product.id} />
              <div className="grid gap-3">
                {product.images.length === 0 ? (
                  <p className="text-sm text-slate-500">No images yet.</p>
                ) : (
                  product.images.map((image) => (
                    <div key={image.id} className="grid grid-cols-[84px_1fr_auto] items-center gap-3 rounded-xl border border-slate-200 p-2">
                      <div className="relative h-16 w-20 overflow-hidden rounded-lg bg-slate-100">
                        <Image src={image.imagePath} alt={image.altText ?? product.publicName} fill className="object-cover" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-slate-500">{image.altText || "No alt text"}</p>
                        {image.isPrimary ? <StatusBadge value="PRIMARY" /> : null}
                      </div>
                      <div className="flex items-center gap-2">
                        {!image.isPrimary ? (
                          <form action={setPrimaryImageAction}>
                            <input type="hidden" name="productId" value={product.id} />
                            <input type="hidden" name="imageId" value={image.id} />
                            <input type="hidden" name="redirectTo" value={`/admin/products/${product.id}`} />
                            <Button size="sm" variant="secondary" type="submit">
                              Primary
                            </Button>
                          </form>
                        ) : null}
                        <form action={deleteProductImageAction}>
                          <input type="hidden" name="productId" value={product.id} />
                          <input type="hidden" name="imageId" value={image.id} />
                          <input type="hidden" name="imagePath" value={image.imagePath} />
                          <input type="hidden" name="redirectTo" value={`/admin/products/${product.id}`} />
                          <Button size="sm" variant="ghost" type="submit">
                            Delete
                          </Button>
                        </form>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Filament Requirements</CardTitle>
              <CardDescription>Plan filament demand for this product.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <form action={guessProductFilamentRequirementsAction} className="flex justify-end">
                <input type="hidden" name="productId" value={product.id} />
                <input type="hidden" name="redirectTo" value={`/admin/products/${product.id}`} />
                <Button type="submit" variant="secondary" size="sm">
                  Guess From Description
                </Button>
              </form>

              <form action={addProductFilamentRequirementAction} className="grid gap-2 sm:grid-cols-3">
                <input type="hidden" name="productId" value={product.id} />
                <input type="hidden" name="redirectTo" value={`/admin/products/${product.id}`} />
                <Select name="filamentId" defaultValue="" required>
                  <option value="" disabled>
                    Select filament
                  </option>
                  {filaments.map((filament) => (
                    <option key={filament.id} value={filament.id}>
                      {filament.name} ({filament.colorLabel})
                    </option>
                  ))}
                </Select>
                <input
                  className="h-10 rounded-xl border border-slate-200 px-3 text-sm"
                  type="number"
                  name="estimatedGramsPerPrint"
                  step="0.01"
                  placeholder="Estimated grams"
                />
                <Button type="submit" variant="secondary">
                  Add / Update
                </Button>
              </form>

              {filamentRequirements.length === 0 ? (
                <p className="text-sm text-slate-500">No filament requirements assigned yet.</p>
              ) : (
                <div className="space-y-2">
                  {filamentRequirements.map((requirement) => (
                    <div key={requirement.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm">
                      <div>
                        <p className="font-medium text-slate-900">{requirement.filament.name}</p>
                        <p className="text-xs text-slate-500">
                          {requirement.estimatedGramsPerPrint
                            ? `${requirement.estimatedGramsPerPrint.toString()}g per print`
                            : "No gram estimate"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <form action={addProductFilamentRequirementAction} className="flex items-center gap-2">
                          <input type="hidden" name="productId" value={product.id} />
                          <input type="hidden" name="filamentId" value={requirement.filamentId} />
                          <input type="hidden" name="redirectTo" value={`/admin/products/${product.id}`} />
                          <Input
                            className="w-36"
                            type="number"
                            name="estimatedGramsPerPrint"
                            step="0.01"
                            min={0}
                            defaultValue={requirement.estimatedGramsPerPrint?.toString() ?? ""}
                            placeholder="Grams / print"
                          />
                          <Button size="sm" variant="secondary" type="submit">
                            Save
                          </Button>
                        </form>
                        <form action={removeProductFilamentRequirementAction}>
                          <input type="hidden" name="productId" value={product.id} />
                          <input type="hidden" name="requirementId" value={requirement.id} />
                          <input type="hidden" name="redirectTo" value={`/admin/products/${product.id}`} />
                          <Button size="sm" variant="ghost" type="submit">
                            Remove
                          </Button>
                        </form>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Listings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {product.listings.length === 0 ? (
              <p className="text-slate-500">No listings yet.</p>
            ) : (
              product.listings.map((listing) => (
                <div key={listing.id} className="rounded-xl border border-slate-200 px-3 py-2">
                  <p className="font-medium text-slate-900">{humanizeEnum(listing.marketplaceType)}</p>
                  <p className="text-xs text-slate-500">{listing.title}</p>
                  <div className="mt-1 flex gap-2">
                    <StatusBadge value={listing.status} />
                    <StatusBadge value={listing.syncStatus} />
                  </div>
                </div>
              ))
            )}
            <Link href="/admin/listings" className="inline-block pt-1 text-xs font-medium text-sky-700 underline">
              Manage all listings
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <TableContainer>
              <Table>
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-2">User</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {product.requests.map((request) => (
                    <tr key={request.id} className="border-b border-slate-100">
                      <td className="px-2 py-2 text-sm text-slate-700">{request.requesterUser.name}</td>
                      <td className="px-2 py-2">
                        <StatusBadge value={request.status} />
                      </td>
                      <td className="px-2 py-2 text-xs text-slate-500">{formatDateTime(request.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Queue Items</CardTitle>
          </CardHeader>
          <CardContent>
            <TableContainer>
              <Table>
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-2">Source</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {product.queueItems.map((queueItem) => (
                    <tr key={queueItem.id} className="border-b border-slate-100">
                      <td className="px-2 py-2 text-sm text-slate-700">{humanizeEnum(queueItem.sourceType)}</td>
                      <td className="px-2 py-2">
                        <StatusBadge value={queueItem.status} />
                      </td>
                      <td className="px-2 py-2 text-xs text-slate-500">{formatDateTime(queueItem.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="border-rose-200">
        <CardHeader>
          <CardTitle className="text-rose-700">Danger Zone</CardTitle>
          <CardDescription>
            Permanently delete this product and its images.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          {hasLinkedWork ? (
            <p className="text-sm text-rose-700">
              This product is linked to {linkedQueueCount} queue item{linkedQueueCount === 1 ? "" : "s"} and{" "}
              {linkedRequestCount} request{linkedRequestCount === 1 ? "" : "s"}. Deleting will also remove those linked
              records.
            </p>
          ) : (
            <p className="text-sm text-slate-600">No linked queue or request records will be removed.</p>
          )}
          <form action={deleteProductAction}>
            <input type="hidden" name="productId" value={product.id} />
            <input type="hidden" name="redirectTo" value="/admin/products" />
            <ConfirmSubmitModalButton
              variant="danger"
              confirmTitle={hasLinkedWork ? "Delete Product And Linked Records?" : "Delete Product?"}
              confirmMessage={
                hasLinkedWork
                  ? `Delete "${product.publicName}" permanently and also remove its ${linkedQueueCount} queue item${linkedQueueCount === 1 ? "" : "s"} plus ${linkedRequestCount} request${linkedRequestCount === 1 ? "" : "s"}? This action cannot be undone.`
                  : `Delete "${product.publicName}" permanently? This action cannot be undone.`
              }
              confirmLabel="Yes, Delete"
              confirmationKeyword={hasLinkedWork ? "delete" : undefined}
              confirmationInputName="confirmWord"
            >
              Delete Product
            </ConfirmSubmitModalButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
