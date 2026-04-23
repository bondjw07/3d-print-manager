import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { FilamentStockForm } from "@/components/forms/filament-stock-form";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmSubmitModalButton } from "@/components/ui/confirm-submit-modal-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableContainer } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import {
  deactivateFilamentAction,
  deleteFilamentAction,
  updateFilamentAction,
  updateFilamentStockAction,
} from "@/server/actions/portal-actions";
import { getFilamentById } from "@/server/services/filament-service";

export default async function AdminFilamentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const filament = await getFilamentById(id);

  if (!filament) {
    notFound();
  }

  const requirements = [...filament.productRequirements].sort((a, b) =>
    a.product.publicName.localeCompare(b.product.publicName),
  );
  const partialRollGrams = filament.partialRolls.map((roll) => Number(roll.gramsRemaining));
  const totalPartialGrams = partialRollGrams.reduce((sum, grams) => sum + grams, 0);

  return (
    <div className="space-y-4">
      <PageHeader className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Filament Detail</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{filament.name}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {filament.materialType} · {filament.colorLabel}
          </p>
        </div>
        <Link href="/admin/filaments">
          <Button variant="secondary">Back to Filaments</Button>
        </Link>
      </PageHeader>

      {query.error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{query.error}</p>
      ) : null}
      {query.success ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{query.success}</p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Edit Filament</CardTitle>
            <CardDescription>Update core filament metadata used by product requirements.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={updateFilamentAction} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="filamentId" value={filament.id} />
              <input type="hidden" name="redirectTo" value={`/admin/filaments/${filament.id}`} />
              <Input name="name" defaultValue={filament.name} placeholder="Name" required />
              <Input name="brand" defaultValue={filament.brand ?? ""} placeholder="Brand (optional)" />
              <Input name="colorLabel" defaultValue={filament.colorLabel} placeholder="Color label" required />
              <Input
                name="materialType"
                defaultValue={filament.materialType}
                placeholder="Material type (PLA, PETG...)"
                required
              />
              <Input
                name="spoolCostPerKg"
                type="number"
                min={0}
                step="0.01"
                defaultValue={filament.spoolCostPerKg.toString()}
                placeholder="Cost per 1000g spool (USD)"
                required
              />
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="isActive">
                  Active
                </label>
                <Select id="isActive" name="isActive" defaultValue={String(filament.isActive)}>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="notes">
                  Notes
                </label>
                <Textarea id="notes" name="notes" defaultValue={filament.notes ?? ""} placeholder="Notes" />
              </div>
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <Button type="submit">Save Filament</Button>
                {filament.isActive ? (
                  <Button type="submit" formAction={deactivateFilamentAction} variant="danger">
                    Deactivate
                  </Button>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Usage Summary</CardTitle>
            <CardDescription>Where this filament is currently required for production planning.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge value={filament.isActive ? "ACTIVE" : "INACTIVE"} />
              <span className="text-sm text-slate-600">{requirements.length} linked products</span>
            </div>
            <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="text-slate-700">
                <span className="font-medium text-slate-900">Created:</span> {formatDateTime(filament.createdAt)}
              </p>
              <p className="text-slate-700">
                <span className="font-medium text-slate-900">Updated:</span> {formatDateTime(filament.updatedAt)}
              </p>
              <p className="text-slate-700">
                <span className="font-medium text-slate-900">Stock:</span> {filament.fullRollCount} full roll
                {filament.fullRollCount === 1 ? "" : "s"} + {filament.partialRolls.length} partial roll
                {filament.partialRolls.length === 1 ? "" : "s"} ({totalPartialGrams.toFixed(1)} g partial)
              </p>
              <p className="text-slate-700">
                <span className="font-medium text-slate-900">Cost per 1000g:</span>{" "}
                {formatCurrency(filament.spoolCostPerKg.toString())}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Stock On Hand</CardTitle>
          <CardDescription>
            Set how many full rolls you have and add each partial roll with grams remaining.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FilamentStockForm
            filamentId={filament.id}
            redirectTo={`/admin/filaments/${filament.id}`}
            fullRollCount={filament.fullRollCount}
            partialRollGrams={partialRollGrams}
            updateAction={updateFilamentStockAction}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Linked Products</CardTitle>
          <CardDescription>
            Products that include this filament in their requirement profile.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TableContainer>
            <Table>
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2">Product</th>
                  <th className="px-2 py-2">Category</th>
                  <th className="px-2 py-2">Gram Estimate</th>
                  <th className="px-2 py-2 text-right">Open</th>
                </tr>
              </thead>
              <tbody>
                {requirements.map((requirement) => (
                  <tr key={requirement.id} className="border-b border-slate-100 hover:bg-slate-50/70">
                    <td className="px-2 py-3">
                      <Link
                        href={`/admin/products/${requirement.productId}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {requirement.product.publicName}
                      </Link>
                    </td>
                    <td className="px-2 py-3 text-sm text-slate-700">{requirement.product.category}</td>
                    <td className="px-2 py-3 text-sm text-slate-700">
                      {requirement.estimatedGramsPerPrint
                        ? `${requirement.estimatedGramsPerPrint.toString()} g`
                        : "Not set"}
                    </td>
                    <td className="px-2 py-3 text-right">
                      <Link href={`/admin/products/${requirement.productId}`}>
                        <Button variant="secondary" size="sm">
                          Product
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
                {requirements.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-2 py-10 text-center text-sm text-slate-500">
                      No products currently reference this filament.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Card className="border-rose-200">
        <CardHeader>
          <CardTitle className="text-rose-700">Danger Zone</CardTitle>
          <CardDescription>Permanently delete this filament.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          {requirements.length > 0 ? (
            <p className="text-sm text-rose-700">
              This filament is linked to {requirements.length} product requirement{requirements.length === 1 ? "" : "s"}.
              Deleting will remove those linked requirement records from products.
            </p>
          ) : (
            <p className="text-sm text-rose-700">
              Warning: this permanently deletes the filament and cannot be undone.
            </p>
          )}
          <form action={deleteFilamentAction}>
            <input type="hidden" name="filamentId" value={filament.id} />
            <input type="hidden" name="redirectTo" value="/admin/filaments" />
            <ConfirmSubmitModalButton
              variant="danger"
              confirmTitle={requirements.length > 0 ? "Delete Filament And Linked Requirements?" : "Delete Filament?"}
              confirmMessage={
                requirements.length > 0
                  ? `Delete "${filament.name}" permanently and remove its ${requirements.length} linked product requirement${requirements.length === 1 ? "" : "s"}? This action cannot be undone.`
                  : `Delete "${filament.name}" permanently? This action cannot be undone.`
              }
              confirmLabel="Yes, Delete"
              confirmationKeyword={requirements.length > 0 ? "delete" : undefined}
              confirmationInputName="confirmWord"
            >
              Delete Filament
            </ConfirmSubmitModalButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
