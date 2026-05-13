import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/badge";
import { SelectAllFormCheckbox } from "@/components/ui/select-all-form-checkbox";
import { Table, TableContainer } from "@/components/ui/table";
import { ProductImportsDropdown } from "@/components/forms/product-imports-dropdown";
import { formatDateTime } from "@/lib/utils";
import { humanizeEnum } from "@/lib/domain";
import { getManagedCreators } from "@/server/services/creator-service";
import { getAdminProducts } from "@/server/services/product-service";
import {
  bulkUpdateProductControlsAction,
} from "@/server/actions/portal-actions";

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; error?: string; success?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const redirectTo = q ? `/admin/products?q=${encodeURIComponent(q)}` : "/admin/products";
  const [products, creators] = await Promise.all([getAdminProducts(q || undefined), getManagedCreators()]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Imports</CardTitle>
          <p className="text-sm text-slate-500">
            Start imports from one place. Supported today: Thangs URLs, MyMiniFactory URLs, Thangs creator discovery,
            MyMiniFactory products CSV upload, and CSV-based filament weight updates with confirmation before apply.
          </p>
        </CardHeader>
        <CardContent>
          <ProductImportsDropdown />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Product Catalog</CardTitle>
            <p className="text-sm text-slate-500">Manage product data, visibility, and lifecycle status.</p>
          </div>
          <Link href="/admin/products/new">
            <Button>Create Product</Button>
          </Link>
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

          <form className="flex gap-2" action="/admin/products" method="get">
            <Input name="q" defaultValue={q} placeholder="Search by internal name, public name, or SKU" />
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>

          <form
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
            </div>
          </form>

          <TableContainer>
            <Table>
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      <SelectAllFormCheckbox
                        formId="bulk-product-update-form"
                        inputName="productIds"
                        totalCount={products.length}
                        ariaLabel="Select all products"
                      />
                      <span className="sr-only">Select</span>
                    </div>
                  </th>
                  <th className="px-2 py-2">Thumb</th>
                  <th className="px-2 py-2">Product</th>
                  <th className="px-2 py-2">SKU</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Visibility</th>
                  <th className="px-2 py-2">Requestable</th>
                  <th className="px-2 py-2">Inventory</th>
                  <th className="px-2 py-2">Updated</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-2 py-3">
                      <input
                        type="checkbox"
                        name="productIds"
                        value={product.id}
                        form="bulk-product-update-form"
                        className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                        aria-label={`Select ${product.publicName}`}
                      />
                    </td>
                    <td className="px-0 py-0">
                      <Link href={`/admin/products/${product.id}`} className="block px-2 py-3">
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
                      <Link className="block px-2 py-3" href={`/admin/products/${product.id}`}>
                        <p className="font-medium text-slate-900 hover:underline">{product.publicName}</p>
                        <p className="text-xs text-slate-500">{product.internalName}</p>
                      </Link>
                    </td>
                    <td className="px-0 py-0">
                      <Link href={`/admin/products/${product.id}`} className="block px-2 py-3 text-sm text-slate-600">
                        {product.sku}
                      </Link>
                    </td>
                    <td className="px-0 py-0">
                      <Link href={`/admin/products/${product.id}`} className="block px-2 py-3">
                        <StatusBadge value={product.status} />
                      </Link>
                    </td>
                    <td className="px-0 py-0">
                      <Link href={`/admin/products/${product.id}`} className="block px-2 py-3 text-sm text-slate-700">
                        {product.isPublic ? "Public" : "Private"}
                      </Link>
                    </td>
                    <td className="px-0 py-0">
                      <Link href={`/admin/products/${product.id}`} className="block px-2 py-3 text-sm text-slate-700">
                        {product.isRequestable ? "Yes" : "No"}
                      </Link>
                    </td>
                    <td className="px-0 py-0">
                      <Link href={`/admin/products/${product.id}`} className="block px-2 py-3 text-sm text-slate-600">
                        {product.inventoryRecord ? `${product.inventoryRecord.available} available` : "No record"}
                      </Link>
                    </td>
                    <td className="px-0 py-0">
                      <Link href={`/admin/products/${product.id}`} className="block px-2 py-3 text-xs text-slate-500">
                        {formatDateTime(product.updatedAt)}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </div>
  );
}
