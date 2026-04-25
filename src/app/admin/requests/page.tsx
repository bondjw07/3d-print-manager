import Image from "next/image";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { SelectAllFormCheckbox } from "@/components/ui/select-all-form-checkbox";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TableContainer } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { humanizeEnum, requestStatusOptions } from "@/lib/domain";
import { bulkManageRequestsAction } from "@/server/actions/portal-actions";
import { getAllRequests } from "@/server/services/request-service";

const FULL_FILAMENT_ROLL_GRAMS = 1000;
const stockFilterOptions = ["all", "printable", "needs_stock", "unknown"] as const;

type StockFilterOption = (typeof stockFilterOptions)[number];
type RequestStockState = "PRINTABLE" | "INSUFFICIENT_STOCK" | "UNKNOWN";
type AdminRequest = Awaited<ReturnType<typeof getAllRequests>>[number];

type RequestStockSummary = {
  state: RequestStockState;
  requiredTotalGrams: number | null;
  missingTotalGrams: number | null;
  detail: string;
};

function formatScalePercent(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "—";
  }

  if (Math.abs(numeric - Math.round(numeric)) < 0.001) {
    return `${Math.round(numeric)}%`;
  }

  return `${numeric.toFixed(2).replace(/\.?0+$/, "")}%`;
}

function formatWeightGrams(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "—";
  }

  if (Math.abs(numeric - Math.round(numeric)) < 0.001) {
    return `${Math.round(numeric)} g`;
  }

  return `${numeric.toFixed(2).replace(/\.?0+$/, "")} g`;
}

function formatKnownWeightGrams(value: number) {
  if (Math.abs(value - Math.round(value)) < 0.001) {
    return `${Math.round(value)} g`;
  }

  return `${value.toFixed(1).replace(/\.0$/, "")} g`;
}

function toFiniteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstSearchParamValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function parseStockFilter(value: string | undefined): StockFilterOption {
  if (!value) {
    return "all";
  }

  return stockFilterOptions.includes(value as StockFilterOption) ? (value as StockFilterOption) : "all";
}

function stockBadgeLabel(state: RequestStockState) {
  if (state === "PRINTABLE") {
    return "Can Print";
  }
  if (state === "INSUFFICIENT_STOCK") {
    return "Need Stock";
  }
  return "Unknown";
}

function stockBadgeClassName(state: RequestStockState) {
  if (state === "PRINTABLE") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (state === "INSUFFICIENT_STOCK") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  return "border-slate-200 bg-slate-100 text-slate-700";
}

function getRequestStockSummary(request: AdminRequest): RequestStockSummary {
  const requirements = request.product.filamentRequirements;
  if (requirements.length === 0) {
    return {
      state: "UNKNOWN",
      requiredTotalGrams: null,
      missingTotalGrams: null,
      detail: "No filament requirements configured.",
    };
  }

  const filamentScaleMultiplier = Math.max(0, toFiniteNumber(request.filamentScalePercent) ?? 100) / 100;
  let requiredTotalGrams = 0;
  let missingTotalGrams = 0;
  let missingEstimateCount = 0;
  const shortfallDetails: string[] = [];

  for (const requirement of requirements) {
    const estimatedGramsPerPrint = toFiniteNumber(requirement.estimatedGramsPerPrint);
    if (estimatedGramsPerPrint === null || estimatedGramsPerPrint <= 0) {
      missingEstimateCount += 1;
      continue;
    }

    const requiredGrams = estimatedGramsPerPrint * request.quantity * filamentScaleMultiplier;
    requiredTotalGrams += requiredGrams;

    const partialRollGrams = requirement.filament.partialRolls.reduce(
      (sum, roll) => sum + (toFiniteNumber(roll.gramsRemaining) ?? 0),
      0,
    );
    const availableGrams = requirement.filament.fullRollCount * FULL_FILAMENT_ROLL_GRAMS + partialRollGrams;

    if (availableGrams + 0.001 < requiredGrams) {
      const shortfallGrams = requiredGrams - availableGrams;
      missingTotalGrams += shortfallGrams;
      shortfallDetails.push(`${requirement.filament.name}: short ${formatKnownWeightGrams(shortfallGrams)}`);
    }
  }

  if (missingTotalGrams > 0) {
    const shortfallPreview = shortfallDetails.slice(0, 2).join("; ");
    const hiddenShortfallCount = shortfallDetails.length - 2;
    const moreText = hiddenShortfallCount > 0 ? ` (+${hiddenShortfallCount} more)` : "";

    return {
      state: "INSUFFICIENT_STOCK",
      requiredTotalGrams,
      missingTotalGrams,
      detail: `${formatKnownWeightGrams(missingTotalGrams)} short. ${shortfallPreview}${moreText}`,
    };
  }

  if (missingEstimateCount > 0) {
    const missingEstimateLabel =
      missingEstimateCount === 1
        ? "1 requirement is missing grams."
        : `${missingEstimateCount} requirements are missing grams.`;

    return {
      state: "UNKNOWN",
      requiredTotalGrams: requiredTotalGrams > 0 ? requiredTotalGrams : null,
      missingTotalGrams: null,
      detail: missingEstimateLabel,
    };
  }

  return {
    state: "PRINTABLE",
    requiredTotalGrams,
    missingTotalGrams: 0,
    detail: `Estimated ${formatKnownWeightGrams(requiredTotalGrams)} required.`,
  };
}

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; success?: string | string[]; stock?: string | string[] }>;
}) {
  const [params, requests] = await Promise.all([searchParams, getAllRequests()]);
  const stockFilter = parseStockFilter(firstSearchParamValue(params.stock));
  const errorMessage = firstSearchParamValue(params.error);
  const successMessage = firstSearchParamValue(params.success);

  const requestsWithStock = requests.map((request) => ({
    request,
    stockSummary: getRequestStockSummary(request),
  }));

  const stockCounts = requestsWithStock.reduce(
    (counts, item) => {
      counts[item.stockSummary.state] += 1;
      return counts;
    },
    {
      PRINTABLE: 0,
      INSUFFICIENT_STOCK: 0,
      UNKNOWN: 0,
    } as Record<RequestStockState, number>,
  );

  const filteredRequests = requestsWithStock.filter((item) => {
    if (stockFilter === "all") {
      return true;
    }

    if (stockFilter === "printable") {
      return item.stockSummary.state === "PRINTABLE";
    }

    if (stockFilter === "needs_stock") {
      return item.stockSummary.state === "INSUFFICIENT_STOCK";
    }

    return item.stockSummary.state === "UNKNOWN";
  });

  const redirectTo = stockFilter === "all" ? "/admin/requests" : `/admin/requests?stock=${stockFilter}`;

  return (
    <div className="space-y-4">
      <PageHeader>
        <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Requests</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Request Management</h1>
      </PageHeader>

      {errorMessage ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</p>
      ) : null}
      {successMessage ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{successMessage}</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>All Requests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form
            action="/admin/requests"
            method="get"
            className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[240px_auto_auto] sm:items-center"
          >
            <Select name="stock" defaultValue={stockFilter}>
              <option value="all">All requests</option>
              <option value="printable">Can print now</option>
              <option value="needs_stock">Need more stock</option>
              <option value="unknown">Unknown stock fit</option>
            </Select>
            <Button type="submit" variant="secondary">
              Apply Filter
            </Button>
            <p className="text-xs text-slate-500">
              {stockCounts.PRINTABLE} printable • {stockCounts.INSUFFICIENT_STOCK} need stock • {stockCounts.UNKNOWN} unknown
            </p>
          </form>

          <form
            id="bulk-request-management-form"
            action={bulkManageRequestsAction}
            className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.1fr)_220px_180px_minmax(0,1fr)_auto]"
          >
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <p className="flex items-center text-sm text-slate-700 sm:col-span-2 lg:col-span-1">
              Bulk manage selected requests: update status/notes, convert to queue, or delete. Scale adjustments are per-request on the detail page.
            </p>
            <Select name="operation" defaultValue="UPDATE">
              <option value="UPDATE">Update status + notes</option>
              <option value="CONVERT_TO_QUEUE">Convert to queue</option>
              <option value="DELETE">Delete requests</option>
            </Select>
            <Select name="status" defaultValue="UNDER_REVIEW">
              {requestStatusOptions.map((status) => (
                <option key={status} value={status}>
                  {humanizeEnum(status)}
                </option>
              ))}
            </Select>
            <Textarea
              name="adminNotes"
              defaultValue=""
              placeholder="Admin notes (used for update action)"
              className="min-h-[42px]"
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
                        formId="bulk-request-management-form"
                        inputName="requestIds"
                        totalCount={filteredRequests.length}
                        ariaLabel="Select all requests"
                      />
                      <span className="sr-only">Select</span>
                    </div>
                  </th>
                  <th className="px-2 py-2">Thumb</th>
                  <th className="px-2 py-2">Requester</th>
                  <th className="px-2 py-2">Product</th>
                  <th className="px-2 py-2">Qty</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Scale</th>
                  <th className="px-2 py-2">Total Weight (g)</th>
                  <th className="px-2 py-2">Calculated Cost</th>
                  <th className="px-2 py-2">Stock Fit</th>
                  <th className="px-2 py-2">Request Notes</th>
                  <th className="px-2 py-2">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map(({ request, stockSummary }) => {
                  const detailHref = `/admin/requests/${request.id}`;
                  const rowLinkClassName =
                    "block h-full px-2 py-3 transition-colors hover:bg-slate-50 focus-visible:bg-sky-50 focus-visible:outline-none";

                  return (
                    <tr key={request.id} className="border-b border-slate-100 align-top">
                      <td className="px-2 py-3">
                        <input
                          type="checkbox"
                          name="requestIds"
                          value={request.id}
                          form="bulk-request-management-form"
                          className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                          aria-label={`Select request from ${request.requesterUser.name}`}
                        />
                      </td>

                      <td className="p-0">
                        <Link href={detailHref} className={rowLinkClassName}>
                          {request.product.images[0] ? (
                            <div className="relative h-14 w-14 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                              <Image
                                src={request.product.images[0].imagePath}
                                alt={request.product.publicName}
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

                      <td className="p-0 text-sm text-slate-700">
                        <Link href={detailHref} className={rowLinkClassName}>
                          <p className="font-medium text-slate-900">{request.requesterUser.name}</p>
                          <p className="text-xs text-slate-500">{request.requesterUser.email}</p>
                        </Link>
                      </td>

                      <td className="p-0 text-sm text-slate-700">
                        <Link href={detailHref} className={rowLinkClassName}>
                          {request.product.publicName}
                        </Link>
                      </td>

                      <td className="p-0 text-sm text-slate-700">
                        <Link href={detailHref} className={rowLinkClassName}>
                          {request.quantity}
                        </Link>
                      </td>

                      <td className="p-0">
                        <Link href={detailHref} className={rowLinkClassName}>
                          <StatusBadge value={request.status} />
                        </Link>
                      </td>

                      <td className="p-0 text-xs text-slate-600">
                        <Link href={detailHref} className={rowLinkClassName}>
                          <p>Model: {formatScalePercent(request.modelScalePercent)}</p>
                          <p>Filament: {formatScalePercent(request.filamentScalePercent)}</p>
                        </Link>
                      </td>

                      <td className="p-0 text-xs text-slate-600">
                        <Link href={detailHref} className={rowLinkClassName}>
                          {formatWeightGrams(request.totalWeightGrams)}
                        </Link>
                      </td>

                      <td className="p-0 text-xs text-slate-600">
                        <Link href={detailHref} className={rowLinkClassName}>
                          {request.calculatedCost === null ? "—" : formatCurrency(request.calculatedCost)}
                        </Link>
                      </td>

                      <td className="p-0 text-xs text-slate-600">
                        <Link href={detailHref} className={rowLinkClassName}>
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${stockBadgeClassName(stockSummary.state)}`}
                          >
                            {stockBadgeLabel(stockSummary.state)}
                          </span>
                          <p className="mt-1">{stockSummary.detail}</p>
                        </Link>
                      </td>

                      <td className="max-w-xs p-0 text-xs text-slate-600">
                        <Link href={detailHref} className={rowLinkClassName}>
                          {request.notes ? (
                            <p className="whitespace-pre-wrap break-words">{request.notes}</p>
                          ) : (
                            <span className="text-slate-400">None</span>
                          )}
                        </Link>
                      </td>

                      <td className="p-0 text-xs text-slate-500">
                        <Link href={detailHref} className={rowLinkClassName}>
                          {formatDateTime(request.createdAt)}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {filteredRequests.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-2 py-10 text-center text-sm text-slate-500">
                      No requests found for this stock filter.
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
