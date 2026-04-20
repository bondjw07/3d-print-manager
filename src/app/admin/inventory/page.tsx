import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TableContainer } from "@/components/ui/table";
import { updateInventoryAction } from "@/server/actions/portal-actions";
import { getInventory } from "@/server/services/inventory-service";

export default async function AdminInventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const [params, inventory] = await Promise.all([searchParams, getInventory()]);

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
          <CardTitle>Inventory Records</CardTitle>
        </CardHeader>
        <CardContent>
          <TableContainer>
            <Table>
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2">Product</th>
                  <th className="px-2 py-2">Available</th>
                  <th className="px-2 py-2">Threshold</th>
                  <th className="px-2 py-2">Adjust</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((record) => {
                  const lowStock =
                    record.reorderThreshold !== null &&
                    (record.available <= record.reorderThreshold || record.available <= 0);

                  return (
                    <tr key={record.id} className="border-b border-slate-100 align-top">
                      <td className="px-2 py-3 text-sm text-slate-700">
                        <p className="font-medium text-slate-900">{record.product.publicName}</p>
                        <p className="text-xs text-slate-500">on hand {record.onHand} / reserved {record.reserved} / committed {record.committed}</p>
                      </td>
                      <td className="px-2 py-3">
                        <StatusBadge value={lowStock ? "LOW_STOCK" : "HEALTHY"} />
                        <p className="mt-1 text-sm text-slate-700">{record.available}</p>
                      </td>
                      <td className="px-2 py-3 text-sm text-slate-700">{record.reorderThreshold ?? "-"}</td>
                      <td className="px-2 py-3">
                        <form action={updateInventoryAction} className="grid gap-2 sm:grid-cols-4">
                          <input type="hidden" name="productId" value={record.productId} />
                          <input type="hidden" name="redirectTo" value="/admin/inventory" />
                          <Input name="onHand" type="number" defaultValue={record.onHand} />
                          <Input name="reserved" type="number" defaultValue={record.reserved} />
                          <Input name="committed" type="number" defaultValue={record.committed} />
                          <Input name="reorderThreshold" type="number" defaultValue={record.reorderThreshold ?? ""} />
                          <div className="sm:col-span-4">
                            <Button type="submit" size="sm" variant="secondary">
                              Save
                            </Button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </div>
  );
}
