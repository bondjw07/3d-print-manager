import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
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
import { humanizeEnum } from "@/lib/domain";
import { prisma } from "@/lib/prisma";
import {
  addProductFilamentRequirementAction,
  deleteProductAction,
  deleteProductImageAction,
  guessProductFilamentRequirementsAction,
  removeProductFilamentRequirementAction,
  refreshProductFromUrlAction,
  setProductStatusAction,
  setPrimaryImageAction,
  updateProductAction,
} from "@/server/actions/portal-actions";
import { getManagedCreators } from "@/server/services/creator-service";
import { getProductByIdForAdmin } from "@/server/services/product-service";

export default async function ProductDetailAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const product = await getProductByIdForAdmin(id);

  if (!product) {
    notFound();
  }

  const [filaments, creators] = await Promise.all([
    prisma.filament.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
    getManagedCreators(),
  ]);

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
  const linkedRequestCount = product._count.requests;
  const linkedQueueCount = product._count.queueItems;
  const hasLinkedWork = linkedRequestCount > 0 || linkedQueueCount > 0;

  return (
    <div className="space-y-4">
      <PageHeader>
        <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Product Detail</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{product.publicName}</h1>
        <p className="mt-1 text-sm text-slate-600">SKU: {product.sku}</p>
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
              currentManagedCreatorId={currentManagedCreatorId}
              action={updateProductAction}
              redirectTo={`/admin/products/${product.id}`}
              submitLabel="Save Product"
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
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
