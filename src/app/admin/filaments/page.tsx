import Link from "next/link";
import { MetricCard } from "@/components/layout/metric-card";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SelectAllFormCheckbox } from "@/components/ui/select-all-form-checkbox";
import { Table, TableContainer } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/utils";
import { FilamentCsvImportForm } from "@/components/forms/filament-csv-import-form";
import {
  bulkUpdateFilamentSpoolCostAction,
  createFilamentAction,
} from "@/server/actions/portal-actions";
import { getFilaments } from "@/server/services/filament-service";
import { getFilamentRequestPurchaseDashboard } from "@/server/services/request-service";

function formatGrams(value: number) {
  if (Math.abs(value - Math.round(value)) < 0.001) {
    return `${Math.round(value)} g`;
  }

  return `${value.toFixed(1).replace(/\.0$/, "")} g`;
}

export default async function AdminFilamentsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; q?: string }>;
}) {
  const [params, allFilaments, purchaseDashboard] = await Promise.all([
    searchParams,
    getFilaments(true),
    getFilamentRequestPurchaseDashboard(),
  ]);
  const query = params.q?.trim().toLowerCase() ?? "";
  const redirectTo = params.q?.trim()
    ? `/admin/filaments?q=${encodeURIComponent(params.q.trim())}`
    : "/admin/filaments";

  const filaments = query
    ? allFilaments.filter((filament) => {
        const haystack = `${filament.name} ${filament.brand ?? ""} ${filament.colorLabel} ${filament.materialType}`.toLowerCase();
        return haystack.includes(query);
      })
    : allFilaments;
  const shortageInsights = purchaseDashboard.insights
    .filter((insight) => insight.missingGrams > 0)
    .sort((left, right) => {
      if (right.missingGrams !== left.missingGrams) {
        return right.missingGrams - left.missingGrams;
      }
      if (right.blockedRequestCount !== left.blockedRequestCount) {
        return right.blockedRequestCount - left.blockedRequestCount;
      }
      return right.requestCount - left.requestCount;
    });
  const impactInsights = purchaseDashboard.insights
    .filter((insight) => insight.missingGrams > 0 || insight.blockedRequestCount > 0)
    .sort((left, right) => {
      if (right.blockedRequestCount !== left.blockedRequestCount) {
        return right.blockedRequestCount - left.blockedRequestCount;
      }
      if (right.requestCount !== left.requestCount) {
        return right.requestCount - left.requestCount;
      }
      if (right.missingGrams !== left.missingGrams) {
        return right.missingGrams - left.missingGrams;
      }
      return left.filamentName.localeCompare(right.filamentName);
    });
  const totalMissingGrams = shortageInsights.reduce((sum, insight) => sum + insight.missingGrams, 0);
  const topImpact = impactInsights[0];

  return (
    <div className="space-y-4">
      <PageHeader>
        <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Filaments</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Filament Catalog</h1>
        <p className="mt-1 text-sm text-slate-600">
          Controlled filament inventory used for product planning and queue aggregation.
        </p>
      </PageHeader>

      {params.error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{params.error}</p>
      ) : null}
      {params.success ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{params.success}</p>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Request Filament Purchase Planner</CardTitle>
            <CardDescription>
              Prioritized shortages across active request statuses (submitted, under review, approved, and queued).
            </CardDescription>
          </div>
          <Link href="/admin/requests?stock=needs_stock">
            <Button variant="secondary" size="sm">
              View Blocked Requests
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Open Requests"
              value={purchaseDashboard.openRequestCount}
              helper="Included in purchase planning"
            />
            <MetricCard label="Filaments Short" value={shortageInsights.length} helper="Need additional grams" />
            <MetricCard label="Total Shortage" value={formatGrams(totalMissingGrams)} helper="Across all filaments" />
            <MetricCard
              label="Unknown Gram Requests"
              value={purchaseDashboard.requestsWithMissingEstimates}
              helper="Need filament estimate cleanup"
            />
          </div>

          {purchaseDashboard.openRequestCount === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-5 text-center text-sm text-slate-500">
              No active requests to plan against right now.
            </p>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Order By Quantity Shortage</p>
                {shortageInsights.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-600">No filament shortages detected for active requests.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {shortageInsights.slice(0, 8).map((insight) => (
                      <div key={insight.filamentId} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-slate-900">{insight.filamentName}</p>
                          <p className="text-sm font-semibold text-rose-700">{formatGrams(insight.missingGrams)} short</p>
                        </div>
                        <p className="text-xs text-slate-600">
                          {insight.colorLabel} • {insight.materialType}
                        </p>
                        <p className="text-xs text-slate-500">
                          Blocks {insight.blockedRequestCount} request{insight.blockedRequestCount === 1 ? "" : "s"} • Used in{" "}
                          {insight.requestCount} request{insight.requestCount === 1 ? "" : "s"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Order By Request Impact</p>
                {impactInsights.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-600">No request-blocking filament shortages at this time.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {impactInsights.slice(0, 8).map((insight, index) => (
                      <div key={insight.filamentId} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-slate-900">
                            #{index + 1} {insight.filamentName}
                          </p>
                          <p className="text-xs font-medium text-slate-600">{formatGrams(insight.missingGrams)} short</p>
                        </div>
                        <p className="text-xs text-slate-600">
                          Unlocks {insight.blockedRequestCount} blocked request{insight.blockedRequestCount === 1 ? "" : "s"} •
                          Needed in {insight.requestCount} total request{insight.requestCount === 1 ? "" : "s"}
                        </p>
                        {insight.requestsWithMissingEstimate > 0 ? (
                          <p className="text-xs text-amber-700">
                            {insight.requestsWithMissingEstimate} request
                            {insight.requestsWithMissingEstimate === 1 ? "" : "s"} missing gram estimate.
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {purchaseDashboard.requestsWithoutFilamentRequirements > 0 ? (
            <p className="text-xs text-amber-700">
              {purchaseDashboard.requestsWithoutFilamentRequirements} request
              {purchaseDashboard.requestsWithoutFilamentRequirements === 1 ? "" : "s"} do not have filament requirements configured yet.
            </p>
          ) : null}
          {topImpact ? (
            <p className="text-xs text-slate-500">
              Top impact purchase right now: <span className="font-medium text-slate-700">{topImpact.filamentName}</span> (
              {topImpact.blockedRequestCount} blocked request{topImpact.blockedRequestCount === 1 ? "" : "s"}).
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Import Filaments</CardTitle>
          <CardDescription>
            Upload a CSV to create filaments in bulk from columns for name, brand, color, and material type.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FilamentCsvImportForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Create Filament</CardTitle>
          <CardDescription>Add a controlled filament option for product requirements.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createFilamentAction} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="redirectTo" value="/admin/filaments" />
            <Input name="name" placeholder="Name" required />
            <Input name="brand" placeholder="Brand (optional)" />
            <Input name="colorLabel" placeholder="Color label" required />
            <Input name="materialType" placeholder="Material type (PLA, PETG...)" required />
            <Input
              name="spoolCostPerKg"
              type="number"
              min={0}
              step="0.01"
              placeholder="Cost per 1000g spool (USD)"
              defaultValue="0"
              required
            />
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="isActive">
                Active
              </label>
              <Select id="isActive" name="isActive" defaultValue="true">
                <option value="true">Yes</option>
                <option value="false">No</option>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Textarea name="notes" placeholder="Notes" />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">Create Filament</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing Filaments</CardTitle>
          <CardDescription>Click a row to open the dedicated filament edit screen.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form action="/admin/filaments" method="get" className="flex gap-2">
            <Input
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Search by name, brand, color, or material"
            />
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>

          <form
            id="bulk-filament-cost-update-form"
            action={bulkUpdateFilamentSpoolCostAction}
            className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_220px_auto]"
          >
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <p className="flex items-center text-sm text-slate-700 sm:col-span-2 lg:col-span-1">
              Bulk update selected filament spool cost (per 1000g).
            </p>
            <Input
              name="spoolCostPerKg"
              type="number"
              min={0}
              step="0.01"
              placeholder="Spool cost (USD)"
              required
            />
            <Button type="submit">Apply to Selected</Button>
          </form>

          <TableContainer>
            <Table>
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      <SelectAllFormCheckbox
                        formId="bulk-filament-cost-update-form"
                        inputName="filamentIds"
                        totalCount={filaments.length}
                        ariaLabel="Select all filaments"
                      />
                      <span className="sr-only">Select</span>
                    </div>
                  </th>
                  <th className="px-2 py-2">Name</th>
                  <th className="px-2 py-2">Material</th>
                  <th className="px-2 py-2">Color</th>
                  <th className="px-2 py-2">Brand</th>
                  <th className="px-2 py-2">Cost / 1000g</th>
                  <th className="px-2 py-2">Stock</th>
                  <th className="px-2 py-2">Usage</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2 text-right">Edit</th>
                </tr>
              </thead>
              <tbody>
                {filaments.map((filament) => {
                  const partialGrams = filament.partialRolls.reduce(
                    (sum, roll) => sum + Number(roll.gramsRemaining),
                    0,
                  );

                  return (
                    <tr key={filament.id} className="border-b border-slate-100 hover:bg-slate-50/70">
                      <td className="px-2 py-3">
                        <input
                          type="checkbox"
                          name="filamentIds"
                          value={filament.id}
                          form="bulk-filament-cost-update-form"
                          className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                          aria-label={`Select ${filament.name}`}
                        />
                      </td>
                      <td className="px-2 py-3">
                        <Link href={`/admin/filaments/${filament.id}`} className="font-medium text-slate-900 hover:underline">
                          {filament.name}
                        </Link>
                      </td>
                      <td className="px-2 py-3 text-sm text-slate-700">{filament.materialType}</td>
                      <td className="px-2 py-3 text-sm text-slate-700">{filament.colorLabel}</td>
                      <td className="px-2 py-3 text-sm text-slate-700">{filament.brand || "-"}</td>
                      <td className="px-2 py-3 text-sm text-slate-700">{formatCurrency(filament.spoolCostPerKg.toString())}</td>
                      <td className="px-2 py-3 text-sm text-slate-700">
                        <p>{filament.fullRollCount} full roll{filament.fullRollCount === 1 ? "" : "s"}</p>
                        <p className="text-xs text-slate-500">
                          {filament.partialRolls.length} partial / {partialGrams.toFixed(1)} g
                        </p>
                      </td>
                      <td className="px-2 py-3 text-sm text-slate-700">
                        {filament.productRequirements.length} products
                      </td>
                      <td className="px-2 py-3">
                        <StatusBadge value={filament.isActive ? "ACTIVE" : "INACTIVE"} />
                      </td>
                      <td className="px-2 py-3 text-right">
                        <Link href={`/admin/filaments/${filament.id}`}>
                          <Button size="sm" variant="secondary">
                            Edit
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {filaments.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-2 py-10 text-center text-sm text-slate-500">
                      No filaments found for this search.
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
