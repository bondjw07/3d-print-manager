import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { humanizeEnum } from "@/lib/domain";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import { isKitKilnModel } from "@/lib/request-scale";
import { getSessionUser } from "@/server/auth/mock-auth-provider";
import { submitRequestAction } from "@/server/actions/portal-actions";
import { getPublicProductBySlug } from "@/server/services/product-service";
import { getDefaultMarketplace } from "@/server/services/settings-service";

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const [{ slug }, query, user, defaultMarketplace] = await Promise.all([
    params,
    searchParams,
    getSessionUser(),
    getDefaultMarketplace(),
  ]);

  const product = await getPublicProductBySlug(slug);
  if (!product || !product.isPublic || product.status !== "ACTIVE") {
    notFound();
  }
  const isKitKilnProduct = isKitKilnModel(product);

  const images =
    product.images.length > 0
      ? product.images
      : [
          {
            id: "fallback",
            imagePath: "/seed-images/geometric-planter-1.svg",
            altText: product.publicName,
            sortOrder: 0,
            isPrimary: true,
            createdAt: new Date(),
          },
        ];

  const defaultListing = product.listings.find(
    (listing) =>
      listing.marketplaceType === defaultMarketplace &&
      listing.status === "PUBLISHED" &&
      listing.externalUrl,
  );
  const requestAsUsers =
    user?.role === "ADMIN"
      ? await prisma.user.findMany({
          select: { id: true, name: true, email: true },
          orderBy: [{ name: "asc" }, { email: "asc" }],
        })
      : [];

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card className="overflow-hidden">
          <div className="grid gap-3 p-4">
            <div className="relative h-[360px] w-full overflow-hidden rounded-2xl bg-slate-100">
              <Image
                src={images[0].imagePath}
                alt={images[0].altText ?? product.publicName}
                fill
                className="object-cover"
              />
            </div>
            {images.length > 1 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {images.slice(1).map((image) => (
                  <div key={image.id} className="relative h-28 overflow-hidden rounded-xl border border-slate-200">
                    <Image src={image.imagePath} alt={image.altText ?? product.publicName} fill className="object-cover" />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{product.publicName}</CardTitle>
            <CardDescription>{product.shortDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-7 text-slate-600">{product.fullDescription}</p>
            <div className="flex flex-wrap gap-2 text-xs text-slate-600">
              {product.tags.map((tag) => (
                <span key={tag} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                  {tag}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              <p>
                Category: <span className="font-medium text-slate-900">{product.category}</span>
              </p>
              <p>
                Inventory Mode: <span className="font-medium text-slate-900">{humanizeEnum(product.inventoryMode)}</span>
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {defaultListing ? (
                <a href={defaultListing.externalUrl ?? "#"} target="_blank" rel="noreferrer">
                  <Button>Buy {formatCurrency(defaultListing.price.toString())}</Button>
                </a>
              ) : null}
              {product.isRequestable ? (
                <a href="#request-form">
                  <Button variant="secondary">Request a Print</Button>
                </a>
              ) : null}
              <Link href="/catalog">
                <Button variant="ghost">Back to catalog</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {product.isRequestable ? (
        <Card id="request-form">
          <CardHeader>
            <CardTitle>Submit a Print Request</CardTitle>
            <CardDescription>
              Requests are available to signed-in request users and admins.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {query.error ? (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{query.error}</p>
            ) : null}
            {query.success ? (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {query.success}
              </p>
            ) : null}

            {user?.role === "REQUEST_USER" || user?.role === "ADMIN" ? (
              <form action={submitRequestAction} className="grid gap-3 sm:max-w-xl">
                <input type="hidden" name="redirectTo" value={`/catalog/${product.slug}`} />
                <input type="hidden" name="productId" value={product.id} />
                {!isKitKilnProduct ? <input type="hidden" name="modelScalePercent" value="100" /> : null}
                {user.role === "ADMIN" ? (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="requestAsUserId">
                      Request as
                    </label>
                    <Select id="requestAsUserId" name="requestAsUserId" defaultValue={user.id} required>
                      {requestAsUsers.map((requestAsUser) => (
                        <option key={requestAsUser.id} value={requestAsUser.id}>
                          {requestAsUser.name} ({requestAsUser.email})
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : null}
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="quantity">
                    Quantity
                  </label>
                  <Input id="quantity" name="quantity" type="number" min={1} defaultValue={1} required />
                </div>
                {isKitKilnProduct ? (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="modelScalePercent">
                      Model scale
                    </label>
                    <Select id="modelScalePercent" name="modelScalePercent" defaultValue="100">
                      <option value="100">100%</option>
                      <option value="75">75% (uses 50% filament)</option>
                    </Select>
                  </div>
                ) : null}
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="notes">
                    Notes (optional)
                  </label>
                  <Textarea id="notes" name="notes" placeholder="Color preference, due date, or special instructions" />
                </div>
                <Button type="submit" className="w-fit">
                  Submit Request
                </Button>
              </form>
            ) : (
              <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-800">
                <p>Sign in as a request user or admin to submit this request.</p>
                <Link href="/login" className="mt-2 inline-block font-medium text-sky-900 underline">
                  Go to sign in
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
