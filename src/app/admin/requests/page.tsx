import Image from "next/image";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { RequestStatusInlineEditor } from "@/components/admin/request-status-inline-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { SelectAllFormCheckbox } from "@/components/ui/select-all-form-checkbox";
import { Table, TableContainer } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  estimateCalendarHoursFromMachineHours,
  estimateWorkItemTime,
  formatDurationHours,
  formatPercent,
} from "@/lib/processing-time-estimates";
import { getProductExternalUrl } from "@/lib/product-external-url";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import {
  type RequestStageKey,
  getRequestStageForStatus,
  humanizeEnum,
  requestStageDefinitions,
  requestStageOptions,
  requestStatusOptions,
} from "@/lib/domain";
import { bulkManageRequestsAction } from "@/server/actions/portal-actions";
import { getAllRequests } from "@/server/services/request-service";
import { getProcessingEstimateSettings } from "@/server/services/settings-service";

const FULL_FILAMENT_ROLL_GRAMS = 1000;
const stockFilterOptions = ["all", "printable", "needs_stock", "unknown"] as const;
const ALL_STAGE_FILTER = "all";
const ALL_CREATOR_FILTER = "all";
const NO_CREATOR_FILTER = "__none__";

type StockFilterOption = (typeof stockFilterOptions)[number];
type StageFilterOption = RequestStageKey | typeof ALL_STAGE_FILTER;
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

function parseStageFilter(value: string | undefined): StageFilterOption {
  if (!value || value === ALL_STAGE_FILTER) {
    return ALL_STAGE_FILTER;
  }

  return requestStageOptions.includes(value as RequestStageKey) ? (value as RequestStageKey) : ALL_STAGE_FILTER;
}

function normalizeCreatorName(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function parseCreatorFilter(value: string | undefined, creatorOptions: string[]) {
  if (!value || value === ALL_CREATOR_FILTER) {
    return ALL_CREATOR_FILTER;
  }

  if (value === NO_CREATOR_FILTER) {
    return NO_CREATOR_FILTER;
  }

  return creatorOptions.includes(value) ? value : ALL_CREATOR_FILTER;
}

function buildRequestsFilterUrl(input: {
  stageFilter: StageFilterOption;
  stockFilter: StockFilterOption;
  creatorFilter: string;
}) {
  const query = new URLSearchParams();
  if (input.stageFilter !== ALL_STAGE_FILTER) {
    query.set("stage", input.stageFilter);
  }
  if (input.stockFilter !== "all") {
    query.set("stock", input.stockFilter);
  }
  if (input.creatorFilter !== ALL_CREATOR_FILTER) {
    query.set("creator", input.creatorFilter);
  }

  const queryString = query.toString();
  return queryString ? `/admin/requests?${queryString}` : "/admin/requests";
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

const stageToneClassName: Record<string, string> = {
  success: "border-emerald-200 bg-emerald-100 text-emerald-800",
  info: "border-sky-200 bg-sky-100 text-sky-800",
  warning: "border-amber-200 bg-amber-100 text-amber-800",
  danger: "border-rose-200 bg-rose-100 text-rose-800",
  neutral: "border-slate-200 bg-slate-100 text-slate-700",
};

function stageBadgeClassName(stageKey: RequestStageKey) {
  const stage = requestStageDefinitions.find((definition) => definition.key === stageKey);
  return stageToneClassName[stage?.tone ?? "neutral"];
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
  searchParams: Promise<{
    error?: string | string[];
    success?: string | string[];
    stage?: string | string[];
    stock?: string | string[];
    creator?: string | string[];
  }>;
}) {
  const [params, requests, processingSettings] = await Promise.all([
    searchParams,
    getAllRequests(),
    getProcessingEstimateSettings(),
  ]);

  const creatorOptions = Array.from(
    new Set(
      requests
        .map((request) => normalizeCreatorName(request.product.importSourceCreatorName))
        .filter((creatorName) => creatorName.length > 0),
    ),
  ).sort((left, right) => left.localeCompare(right));

  const stageFilter = parseStageFilter(firstSearchParamValue(params.stage));
  const stockFilter = parseStockFilter(firstSearchParamValue(params.stock));
  const creatorFilter = parseCreatorFilter(firstSearchParamValue(params.creator), creatorOptions);
  const errorMessage = firstSearchParamValue(params.error);
  const successMessage = firstSearchParamValue(params.success);

  const requestsWithStockAndTime = requests.map((request) => ({
    request,
    stockSummary: getRequestStockSummary(request),
    timeEstimate: estimateWorkItemTime({
      totalWeightGrams: request.totalWeightGrams,
      quantity: request.quantity,
      settings: processingSettings,
    }),
    stageKey: getRequestStageForStatus(request.status),
  }));

  const stockCounts = requestsWithStockAndTime.reduce(
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

  const filteredRequests = requestsWithStockAndTime.filter((item) => {
    if (stageFilter !== ALL_STAGE_FILTER && item.stageKey !== stageFilter) {
      return false;
    }

    if (stockFilter !== "all") {
      if (stockFilter === "printable" && item.stockSummary.state !== "PRINTABLE") {
        return false;
      }

      if (stockFilter === "needs_stock" && item.stockSummary.state !== "INSUFFICIENT_STOCK") {
        return false;
      }

      if (stockFilter === "unknown" && item.stockSummary.state !== "UNKNOWN") {
        return false;
      }
    }

    const creatorName = normalizeCreatorName(item.request.product.importSourceCreatorName);
    if (creatorFilter === NO_CREATOR_FILTER && creatorName) {
      return false;
    }
    if (creatorFilter !== ALL_CREATOR_FILTER && creatorFilter !== NO_CREATOR_FILTER && creatorName !== creatorFilter) {
      return false;
    }

    return true;
  });

  const redirectTo = buildRequestsFilterUrl({
    stageFilter,
    stockFilter,
    creatorFilter,
  });
  const stageCounts = requestStageDefinitions.map((definition) => ({
    key: definition.key,
    count: requestsWithStockAndTime.filter((item) => item.stageKey === definition.key).length,
  }));
  const totalMachineHours = filteredRequests.reduce(
    (sum, item) => sum + (item.timeEstimate?.totalHours ?? 0),
    0,
  );
  const totalCalendarHours = estimateCalendarHoursFromMachineHours(totalMachineHours, processingSettings);
  const unknownEstimateCount = filteredRequests.filter((item) => item.timeEstimate === null).length;

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
            className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-[220px_220px_240px_auto_auto] lg:items-center"
          >
            <Select name="stage" defaultValue={stageFilter}>
              <option value={ALL_STAGE_FILTER}>All stage groups</option>
              {requestStageDefinitions.map((stage) => (
                <option key={stage.key} value={stage.key}>
                  {stage.label}
                </option>
              ))}
            </Select>
            <Select name="stock" defaultValue={stockFilter}>
              <option value="all">All requests</option>
              <option value="printable">Can print now</option>
              <option value="needs_stock">Need more stock</option>
              <option value="unknown">Unknown stock fit</option>
            </Select>
            <Select name="creator" defaultValue={creatorFilter}>
              <option value={ALL_CREATOR_FILTER}>All creators</option>
              <option value={NO_CREATOR_FILTER}>No creator set</option>
              {creatorOptions.map((creator) => (
                <option key={creator} value={creator}>
                  {creator}
                </option>
              ))}
            </Select>
            <Button type="submit" variant="secondary">
              Apply Filters
            </Button>
            <Link
              href="/admin/requests"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
            >
              Clear
            </Link>
            <p className="text-xs text-slate-500 sm:col-span-2 lg:col-span-5">
              Showing {filteredRequests.length} of {requestsWithStockAndTime.length} requests • {stockCounts.PRINTABLE} printable •{" "}
              {stockCounts.INSUFFICIENT_STOCK} need stock • {stockCounts.UNKNOWN} unknown
            </p>
          </form>

          <div className="flex flex-wrap gap-2">
            <Link
              href={buildRequestsFilterUrl({
                stageFilter: ALL_STAGE_FILTER,
                stockFilter,
                creatorFilter,
              })}
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${
                stageFilter === ALL_STAGE_FILTER
                  ? "border-slate-400 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              All Stages ({requestsWithStockAndTime.length})
            </Link>
            {requestStageDefinitions.map((stage) => {
              const stageCount = stageCounts.find((entry) => entry.key === stage.key)?.count ?? 0;
              return (
                <Link
                  key={stage.key}
                  href={buildRequestsFilterUrl({
                    stageFilter: stage.key,
                    stockFilter,
                    creatorFilter,
                  })}
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${
                    stageFilter === stage.key
                      ? "border-slate-400 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {stage.label} ({stageCount})
                </Link>
              );
            })}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <p>
              Estimated machine workload:{" "}
              <span className="font-medium text-slate-800">{formatDurationHours(totalMachineHours)}</span>
            </p>
            <p>
              Estimated wall-clock time at {processingSettings.printerCount} printer
              {processingSettings.printerCount === 1 ? "" : "s"} and {formatPercent(processingSettings.printerUtilizationRate)} utilization:{" "}
              <span className="font-medium text-slate-800">{formatDurationHours(totalCalendarHours)}</span>
            </p>
            {unknownEstimateCount > 0 ? (
              <p className="text-amber-700">
                {unknownEstimateCount} request{unknownEstimateCount === 1 ? "" : "s"} missing weight estimates and excluded from totals.
              </p>
            ) : null}
          </div>

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

          <div className="flex items-center gap-2 text-xs text-slate-600">
            <SelectAllFormCheckbox
              formId="bulk-request-management-form"
              inputName="requestIds"
              totalCount={filteredRequests.length}
              ariaLabel="Select all filtered requests"
            />
            <span>Select all filtered requests</span>
          </div>

          {requestStageDefinitions.map((stage) => {
            const stageRows = filteredRequests.filter((item) => item.stageKey === stage.key);
            const stageTotalUnits = stageRows.reduce((sum, row) => sum + row.request.quantity, 0);
            const stageMachineHours = stageRows.reduce((sum, row) => sum + (row.timeEstimate?.totalHours ?? 0), 0);
            const stageUnknownEstimateCount = stageRows.filter((row) => row.timeEstimate === null).length;
            const oldestCreatedAt =
              stageRows.length > 0
                ? new Date(Math.min(...stageRows.map((row) => row.request.createdAt.getTime())))
                : null;
            const defaultOpen = stage.key !== "CLOSED_EXCEPTION" || stageFilter === stage.key;

            return (
              <Card key={stage.key} className="overflow-hidden">
                <details open={defaultOpen} className="group">
                  <summary className="list-none cursor-pointer px-4 py-3 [&::-webkit-details-marker]:hidden">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${stageBadgeClassName(stage.key)}`}>
                            {stage.label}
                          </span>
                          <span className="text-xs text-slate-500">{stageRows.length} items</span>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">
                          {stageTotalUnits} units • {formatDurationHours(stageMachineHours)} machine time
                          {oldestCreatedAt ? ` • Oldest submitted ${formatDateTime(oldestCreatedAt)}` : ""}
                        </p>
                        {stageUnknownEstimateCount > 0 ? (
                          <p className="text-xs text-amber-700">
                            {stageUnknownEstimateCount} item{stageUnknownEstimateCount === 1 ? "" : "s"} missing time estimate.
                          </p>
                        ) : null}
                      </div>
                      <span className="text-xs font-medium text-slate-500">
                        <span className="group-open:hidden">Expand</span>
                        <span className="hidden group-open:inline">Collapse</span>
                      </span>
                    </div>
                  </summary>
                  <CardContent className="border-t border-slate-200 pt-3">
                    {stageRows.length === 0 ? (
                      <p className="py-6 text-center text-sm text-slate-500">No requests in this stage.</p>
                    ) : (
                      <TableContainer>
                        <Table>
                          <thead>
                            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                              <th className="px-2 py-2">Select</th>
                              <th className="px-2 py-2">Thumb</th>
                              <th className="px-2 py-2">Requester</th>
                              <th className="px-2 py-2">Product</th>
                              <th className="px-2 py-2">Source</th>
                              <th className="px-2 py-2">Qty</th>
                              <th className="px-2 py-2">Status</th>
                              <th className="px-2 py-2">Scale</th>
                              <th className="px-2 py-2">Total Weight (g)</th>
                              <th className="px-2 py-2">Est Time</th>
                              <th className="px-2 py-2">Calculated Cost</th>
                              <th className="px-2 py-2">Stock Fit</th>
                              <th className="px-2 py-2">Request Notes</th>
                              <th className="px-2 py-2">Submitted</th>
                            </tr>
                          </thead>
                          <tbody>
                            {stageRows.map(({ request, stockSummary, timeEstimate }) => {
                              const detailHref = `/admin/requests/${request.id}`;
                              const productExternalUrl = getProductExternalUrl(request.product);
                              const rowLinkClassName = "block h-full px-2 py-3 focus-visible:outline-none";

                              return (
                                <tr key={request.id} className="border-b border-slate-100 align-top transition-colors hover:bg-slate-50 focus-within:bg-slate-50">
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

                                  <td className="px-2 py-3 text-center">
                                    {productExternalUrl ? (
                                      <a
                                        href={productExternalUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title={productExternalUrl}
                                        aria-label={`Open external URL for ${request.product.publicName}`}
                                        className="inline-flex rounded-md p-1 text-slate-500 transition-colors hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                                      >
                                        <ExternalLink className="h-4 w-4" />
                                      </a>
                                    ) : (
                                      <span className="text-slate-300">—</span>
                                    )}
                                  </td>

                                  <td className="p-0 text-sm text-slate-700">
                                    <Link href={detailHref} className={rowLinkClassName}>
                                      {request.quantity}
                                    </Link>
                                  </td>

                                  <td className="p-0">
                                    <div className="space-y-2 px-2 py-3">
                                      <RequestStatusInlineEditor
                                        requestId={request.id}
                                        currentStatus={request.status}
                                        adminNotes={request.adminNotes}
                                        redirectTo={redirectTo}
                                      />
                                    </div>
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
                                      {timeEstimate ? (
                                        <>
                                          <p>~{formatDurationHours(timeEstimate.totalHours)} total</p>
                                          <p className="text-slate-500">~{formatDurationHours(timeEstimate.hoursPerPrint)}/print</p>
                                        </>
                                      ) : (
                                        <span className="text-slate-400">—</span>
                                      )}
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
                          </tbody>
                        </Table>
                      </TableContainer>
                    )}
                  </CardContent>
                </details>
              </Card>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
