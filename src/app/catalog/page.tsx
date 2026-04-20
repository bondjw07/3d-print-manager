import Image from "next/image";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/badge";
import { getPublicCatalogStats } from "@/server/services/dashboard-service";
import { getPublicProducts } from "@/server/services/product-service";
import { getDefaultMarketplace } from "@/server/services/settings-service";
import { humanizeEnum } from "@/lib/domain";

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";

  const [products, stats, defaultMarketplace] = await Promise.all([
    getPublicProducts(q || undefined),
    getPublicCatalogStats(),
    getDefaultMarketplace(),
  ]);

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
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => {
            const primaryImage = product.images[0]?.imagePath ?? "/seed-images/geometric-planter-1.svg";
            const defaultListing = product.listings.find(
              (listing) => listing.marketplaceType === defaultMarketplace && listing.externalUrl,
            );

            return (
              <Card key={product.id} className="overflow-hidden">
                <div className="relative h-48 w-full bg-slate-100">
                  <Image src={primaryImage} alt={product.publicName} fill className="object-cover" />
                </div>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle>{product.publicName}</CardTitle>
                    <StatusBadge value={product.status} />
                  </div>
                  <CardDescription>{product.shortDescription}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-slate-500">Category: {product.category}</p>
                  <div className="flex flex-wrap gap-2">
                    {defaultListing ? (
                      <a href={defaultListing.externalUrl ?? "#"} target="_blank" rel="noreferrer">
                        <Button size="sm">Buy</Button>
                      </a>
                    ) : null}
                    {product.isRequestable ? (
                      <Link href={`/catalog/${product.slug}`}>
                        <Button size="sm" variant="secondary">
                          Request
                        </Button>
                      </Link>
                    ) : null}
                    <Link href={`/catalog/${product.slug}`}>
                      <Button size="sm" variant="ghost">
                        View
                      </Button>
                    </Link>
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
