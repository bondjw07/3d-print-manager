import Image from "next/image";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TableContainer } from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import { getInventory } from "@/server/services/inventory-service";

export default async function AdminInventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const [params, inventory] = await Promise.all([searchParams, getInventory({ inStockOnly: true })]);

  return (
    <div className="space-y-4">
      <PageHeader>
        <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Inventory</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Product-Level Inventory</h1>
      </PageHeader>

      {params.error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{params.error}</p>
      ) : null}
      {params.success ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{params.success}</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>In-Stock Inventory</CardTitle>
        </CardHeader>
        <CardContent>
          <TableContainer>
            <Table>
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2">Thumb</th>
                  <th className="px-2 py-2">Product</th>
                  <th className="px-2 py-2">Available</th>
                  <th className="px-2 py-2">Threshold</th>
                  <th className="px-2 py-2">Updated</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((record) => {
                  const lowStock =
                    record.reorderThreshold !== null &&
                    (record.available <= record.reorderThreshold || record.available <= 0);
                  const productDetailHref = `/admin/products/${record.productId}`;

                  return (
                    <tr key={record.id} className="border-b border-slate-100 align-top hover:bg-slate-50">
                      <td className="px-0 py-0">
                        <Link href={productDetailHref} className="block px-2 py-3">
                          {record.product.images[0] ? (
                            <div className="relative h-14 w-14 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                              <Image
                                src={record.product.images[0].imagePath}
                                alt={record.product.publicName}
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
                      <td className="px-0 py-0 text-sm text-slate-700">
                        <Link href={productDetailHref} className="block px-2 py-3">
                          <p className="font-medium text-slate-900 hover:underline">{record.product.publicName}</p>
                          <p className="text-xs text-slate-500">
                            on hand {record.onHand} / reserved {record.reserved} / committed {record.committed}
                          </p>
                        </Link>
                      </td>
                      <td className="px-0 py-0">
                        <Link href={productDetailHref} className="block px-2 py-3">
                          <StatusBadge value={lowStock ? "LOW_STOCK" : "HEALTHY"} />
                          <p className="mt-1 text-sm text-slate-700">{record.available}</p>
                        </Link>
                      </td>
                      <td className="px-0 py-0 text-sm text-slate-700">
                        <Link href={productDetailHref} className="block px-2 py-3">
                          {record.reorderThreshold ?? "-"}
                        </Link>
                      </td>
                      <td className="px-0 py-0 text-xs text-slate-500">
                        <Link href={productDetailHref} className="block px-2 py-3">
                          {formatDateTime(record.updatedAt)}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {inventory.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-2 py-10 text-center text-sm text-slate-500">
                      No products currently have on-hand inventory.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </div>
  );
}
