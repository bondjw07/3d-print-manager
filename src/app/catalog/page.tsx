import Image from "next/image";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { RequestPrintModalButton } from "@/components/catalog/request-print-modal-button";
import { getPublicCatalogStats } from "@/server/services/dashboard-service";
import { getPublicProducts } from "@/server/services/product-service";
import { getDefaultMarketplace } from "@/server/services/settings-service";
import { getSessionUser } from "@/server/auth/mock-auth-provider";
import { getRequestSummariesForUserByProductIds } from "@/server/services/request-service";
import { humanizeEnum } from "@/lib/domain";

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";

  const [products, stats, defaultMarketplace, user] = await Promise.all([
    getPublicProducts(q || undefined),
    getPublicCatalogStats(),
    getDefaultMarketplace(),
    getSessionUser(),
  ]);
  const requestSummaryByProduct = user
    ? await getRequestSummariesForUserByProductIds(
        user.id,
        products.map((product) => product.id),
      )
    : new Map();
  const canSubmitRequest = user?.role === "REQUEST_USER" || user?.role === "ADMIN";
  const redirectTo = q ? `/catalog?${new URLSearchParams({ q }).toString()}` : "/catalog";

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <section className="catalog-hero-bg rounded-3xl border border-slate-200 p-6 shadow-[0_20px_70px_-42px_rgba(14,116,144,0.4)]">
        <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Public Catalog</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Browse Printable Products</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Explore active products available for purchase or print request. Default marketplace for Buy buttons: {" "}
          <span className="font-medium text-slate-900">{humanizeEnum(defaultMarketplace)}</span>
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-600">
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1">{stats.activeProducts} active products</span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
            {stats.requestableProducts} requestable products
          </span>
        </div>
      </section>

      <Card>
        <CardContent className="pt-5">
          <form className="flex gap-2" action="/catalog" method="get">
            <Input name="q" placeholder="Search products, category, or description" defaultValue={q} />
            <Button type="submit">Search</Button>
          </form>
        </CardContent>
      </Card>

      {products.length === 0 ? (
        <EmptyState title="No products found" description="Try a different search term or clear filters." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((product) => {
            const primaryImage = product.images[0]?.imagePath ?? "/seed-images/geometric-planter-1.svg";
            const defaultListing = product.listings.find(
              (listing) => listing.marketplaceType === defaultMarketplace && listing.externalUrl,
            );
            const requestSummary = requestSummaryByProduct.get(product.id);
            const requestStatusSummary = requestSummary
              ? `${requestSummary.totalQuantity}x${requestSummary.requestCount > 1 ? ` • ${requestSummary.requestCount} reqs` : ""} • ${humanizeEnum(requestSummary.latestStatus)}`
              : null;

            return (
              <Card key={product.id} className="flex h-full flex-col overflow-hidden">
                <Link href={`/catalog/${product.slug}`} aria-label={`View details for ${product.publicName}`} className="block">
                  <div className="relative aspect-[5/4] w-full bg-slate-100">
                    <Image src={primaryImage} alt={product.publicName} fill className="object-cover" />
                  </div>
                </Link>
                <CardHeader className="flex-1">
                  <CardTitle>{product.publicName}</CardTitle>
                  <CardDescription
                    style={{
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {product.shortDescription}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-slate-500">Category: {product.category}</p>
                  <div className="flex items-center gap-2">
                    <Link href={`/catalog/${product.slug}`}>
                      <Button size="sm" variant="ghost">
                        View
                      </Button>
                    </Link>
                    {defaultListing ? (
                      <a href={defaultListing.externalUrl ?? "#"} target="_blank" rel="noreferrer">
                        <Button size="sm">Buy</Button>
                      </a>
                    ) : null}
                    {requestStatusSummary ? (
                      <span className="ml-auto max-w-[52%] truncate text-[11px] font-medium text-sky-700" title={requestStatusSummary}>
                        {requestStatusSummary}
                      </span>
                    ) : null}
                    {product.isRequestable ? (
                      <RequestPrintModalButton
                        productId={product.id}
                        productName={product.publicName}
                        productSlug={product.slug}
                        redirectTo={redirectTo}
                        canSubmitRequest={canSubmitRequest}
                        buttonLabel={requestSummary ? "Requested" : "Request"}
                        buttonVariant={requestSummary ? "success" : "secondary"}
                        buttonClassName={requestSummary ? undefined : "ml-auto"}
                      />
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
