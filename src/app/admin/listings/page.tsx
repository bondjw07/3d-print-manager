import Image from "next/image";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TableContainer } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import {
  humanizeEnum,
  listingStatusOptions,
  marketplaceTypeOptions,
  productStatusOptions,
  syncStatusOptions,
} from "@/lib/domain";
import {
  bulkUpdateListingProductControlsAction,
  createListingAction,
  runListingActionAction,
  simulateMarketplaceEventAction,
  updateListingAction,
} from "@/server/actions/portal-actions";
import { getListings } from "@/server/services/listing-service";
import { getMarketplaceEvents } from "@/server/services/marketplace-event-service";
import { prisma } from "@/lib/prisma";

export default async function AdminListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; q?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim();
  const redirectTo = q ? `/admin/listings?q=${encodeURIComponent(q)}` : "/admin/listings";

  const [products, listings, events] = await Promise.all([
    prisma.product.findMany({ orderBy: { publicName: "asc" } }),
    getListings(q),
    getMarketplaceEvents(10),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader>
        <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Listings</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Marketplace Listing Management</h1>
        <p className="mt-1 text-sm text-slate-600">Create, update, and run mocked marketplace actions.</p>
      </PageHeader>

      {params.error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{params.error}</p>
      ) : null}
      {params.success ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{params.success}</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Create or Upsert Listing</CardTitle>
          <CardDescription>
            Product data is the source of truth; listing fields can override title, copy, tags, and pricing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createListingAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <input type="hidden" name="redirectTo" value="/admin/listings" />
            <Select name="productId" defaultValue="" required>
              <option value="" disabled>
                Select product
              </option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.publicName}
                </option>
              ))}
            </Select>
            <Select name="marketplaceType" defaultValue="ETSY" required>
              {marketplaceTypeOptions.map((marketplace) => (
                <option key={marketplace} value={marketplace}>
                  {humanizeEnum(marketplace)}
                </option>
              ))}
            </Select>
            <Input name="externalListingId" placeholder="External listing id" />
            <Input name="title" placeholder="Listing title" required className="lg:col-span-2" />
            <Input name="price" type="number" step="0.01" min={0} placeholder="Price" required />
            <Textarea name="description" placeholder="Listing description" required className="sm:col-span-2 lg:col-span-3" />
            <Input name="tags" placeholder="tags, comma, separated" className="sm:col-span-2" />
            <Input name="externalUrl" placeholder="https://marketplace.example/listing" />
            <Select name="status" defaultValue="DRAFT">
              {listingStatusOptions.map((status) => (
                <option key={status} value={status}>
                  {humanizeEnum(status)}
                </option>
              ))}
            </Select>
            <Select name="syncStatus" defaultValue="NOT_SYNCED">
              {syncStatusOptions.map((status) => (
                <option key={status} value={status}>
                  {humanizeEnum(status)}
                </option>
              ))}
            </Select>
            <div className="sm:col-span-2 lg:col-span-3">
              <Button type="submit">Save Listing</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Listings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form className="flex gap-2" action="/admin/listings" method="get">
            <Input name="q" defaultValue={q ?? ""} placeholder="Search title, product, external id" />
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>

          <form
            id="bulk-listing-update-form"
            action={bulkUpdateListingProductControlsAction}
            className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_180px_180px_180px_auto]"
          >
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <p className="flex items-center text-sm text-slate-700 sm:col-span-2 lg:col-span-1">
              Bulk update selected listings: product status, visibility, and requestability.
            </p>
            <Select name="status" defaultValue="ACTIVE">
              {productStatusOptions.map((status) => (
                <option key={status} value={status}>
                  {humanizeEnum(status)}
                </option>
              ))}
            </Select>
            <Select name="isPublic" defaultValue="true">
              <option value="true">Public</option>
              <option value="false">Private</option>
            </Select>
            <Select name="isRequestable" defaultValue="false">
              <option value="true">Requestable</option>
              <option value="false">Not requestable</option>
            </Select>
            <Button type="submit">Apply to Selected</Button>
          </form>

          <TableContainer>
            <Table>
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="px-2 py-2">Thumb</th>
                  <th className="px-2 py-2">Product</th>
                  <th className="px-2 py-2">Marketplace</th>
                  <th className="px-2 py-2">Price</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Sync</th>
                  <th className="px-2 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((listing) => (
                  <tr key={listing.id} className="border-b border-slate-100 align-top">
                    <td className="px-2 py-3">
                      <input
                        type="checkbox"
                        name="listingIds"
                        value={listing.id}
                        form="bulk-listing-update-form"
                        className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                        aria-label={`Select ${listing.product.publicName}`}
                      />
                    </td>
                    <td className="px-2 py-3">
                      {listing.product.images[0] ? (
                        <div className="relative h-14 w-14 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                          <Image
                            src={listing.product.images[0].imagePath}
                            alt={listing.product.publicName}
                            fill
                            className="object-cover"
                          />
                        </div>
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-[10px] text-slate-500">
                          No Image
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-3">
                      <p className="text-sm font-medium text-slate-900">{listing.product.publicName}</p>
                      <p className="text-xs text-slate-500">{listing.title}</p>
                      <div className="mt-1">
                        <StatusBadge value={listing.product.status} />
                      </div>
                    </td>
                    <td className="px-2 py-3 text-sm text-slate-700">{humanizeEnum(listing.marketplaceType)}</td>
                    <td className="px-2 py-3 text-sm text-slate-700">{formatCurrency(listing.price.toString())}</td>
                    <td className="px-2 py-3">
                      <StatusBadge value={listing.status} />
                    </td>
                    <td className="px-2 py-3">
                      <StatusBadge value={listing.syncStatus} />
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex flex-wrap gap-2">
                        <form action={runListingActionAction}>
                          <input type="hidden" name="listingId" value={listing.id} />
                          <input type="hidden" name="redirectTo" value="/admin/listings" />
                          <input type="hidden" name="action" value="publish" />
                          <Button type="submit" variant="ghost" size="sm">
                            Publish
                          </Button>
                        </form>
                        <form action={runListingActionAction}>
                          <input type="hidden" name="listingId" value={listing.id} />
                          <input type="hidden" name="redirectTo" value="/admin/listings" />
                          <input type="hidden" name="action" value="update" />
                          <Button type="submit" variant="ghost" size="sm">
                            Update
                          </Button>
                        </form>
                        <form action={runListingActionAction}>
                          <input type="hidden" name="listingId" value={listing.id} />
                          <input type="hidden" name="redirectTo" value="/admin/listings" />
                          <input type="hidden" name="action" value="remove" />
                          <Button type="submit" variant="ghost" size="sm">
                            Remove
                          </Button>
                        </form>
                        <form action={runListingActionAction}>
                          <input type="hidden" name="listingId" value={listing.id} />
                          <input type="hidden" name="redirectTo" value="/admin/listings" />
                          <input type="hidden" name="action" value="refresh" />
                          <Button type="submit" variant="secondary" size="sm">
                            Refresh
                          </Button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableContainer>

          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <h3 className="text-sm font-semibold text-slate-900">Quick Edit Listing</h3>
            <form action={updateListingAction} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <input type="hidden" name="redirectTo" value="/admin/listings" />
              <Select name="listingId" defaultValue="" required>
                <option value="" disabled>
                  Select listing
                </option>
                {listings.map((listing) => (
                  <option key={listing.id} value={listing.id}>
                    {listing.product.publicName} - {humanizeEnum(listing.marketplaceType)}
                  </option>
                ))}
              </Select>
              <Select name="productId" defaultValue={listings[0]?.productId ?? ""} required>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.publicName}
                  </option>
                ))}
              </Select>
              <Select name="marketplaceType" defaultValue="ETSY" required>
                {marketplaceTypeOptions.map((marketplace) => (
                  <option key={marketplace} value={marketplace}>
                    {humanizeEnum(marketplace)}
                  </option>
                ))}
              </Select>
              <Input name="externalListingId" placeholder="External listing id" />
              <Input name="title" placeholder="Title" required className="lg:col-span-2" />
              <Input name="price" placeholder="Price" type="number" step="0.01" min={0} required />
              <Input name="externalUrl" placeholder="External URL" />
              <Textarea name="description" placeholder="Description" required className="sm:col-span-2 lg:col-span-4" />
              <Input name="tags" placeholder="Tags" className="sm:col-span-2" />
              <Select name="status" defaultValue="DRAFT">
                {listingStatusOptions.map((status) => (
                  <option key={status} value={status}>
                    {humanizeEnum(status)}
                  </option>
                ))}
              </Select>
              <Select name="syncStatus" defaultValue="NOT_SYNCED">
                {syncStatusOptions.map((status) => (
                  <option key={status} value={status}>
                    {humanizeEnum(status)}
                  </option>
                ))}
              </Select>
              <div className="sm:col-span-2 lg:col-span-4">
                <Button type="submit">Apply Listing Update</Button>
              </div>
            </form>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Simulate Marketplace Event</CardTitle>
            <CardDescription>Trigger mocked webhook behavior for operational testing.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={simulateMarketplaceEventAction} className="grid gap-2 sm:grid-cols-2">
              <input type="hidden" name="redirectTo" value="/admin/listings" />
              <Select name="marketplaceType" defaultValue="ETSY" required>
                {marketplaceTypeOptions.map((marketplace) => (
                  <option key={marketplace} value={marketplace}>
                    {humanizeEnum(marketplace)}
                  </option>
                ))}
              </Select>
              <Select name="eventType" defaultValue="SALE_OCCURRED" required>
                <option value="SALE_OCCURRED">Sale occurred</option>
                <option value="LISTING_REMOVED">Listing removed</option>
                <option value="LISTING_CHANGED_EXTERNALLY">Listing changed externally</option>
              </Select>
              <Select name="listingId" defaultValue="">
                <option value="">No related listing</option>
                {listings.map((listing) => (
                  <option key={listing.id} value={listing.id}>
                    {listing.product.publicName} - {humanizeEnum(listing.marketplaceType)}
                  </option>
                ))}
              </Select>
              <Select name="productId" defaultValue="">
                <option value="">No related product</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.publicName}
                  </option>
                ))}
              </Select>
              <Textarea
                name="payloadSummary"
                className="sm:col-span-2"
                defaultValue="Mock payload generated from admin console"
                required
              />
              <div className="sm:col-span-2">
                <Button type="submit">Process Mock Event</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Event History</CardTitle>
          </CardHeader>
          <CardContent>
            <TableContainer>
              <Table>
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-2">Event</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id} className="border-b border-slate-100">
                      <td className="px-2 py-2 text-sm text-slate-700">
                        {humanizeEnum(event.eventType)}
                        <p className="text-xs text-slate-500">{event.payloadSummary}</p>
                      </td>
                      <td className="px-2 py-2">
                        <StatusBadge value={event.processingStatus} />
                      </td>
                      <td className="px-2 py-2 text-xs text-slate-500">{formatDateTime(event.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
