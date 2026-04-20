import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { ProductForm } from "@/components/forms/product-form";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createProductAction } from "@/server/actions/portal-actions";

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="space-y-4">
      <PageHeader>
        <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Products</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Create Product</h1>
      </PageHeader>

      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">Define a new product in the master catalog.</p>
            <Link href="/admin/products">
              <Button variant="secondary" size="sm">
                Back to Products
              </Button>
            </Link>
          </div>

          {params.error ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{params.error}</p>
          ) : null}

          <ProductForm action={createProductAction} redirectTo="/admin/products/new" submitLabel="Create Product" />
        </CardContent>
      </Card>
    </div>
  );
}
