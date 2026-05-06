import Image from "next/image";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { CreateQueueItemModalButton } from "@/components/admin/create-queue-item-modal-button";
import { QueueStatusInlineEditor } from "@/components/admin/queue-status-inline-editor";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Table, TableContainer } from "@/components/ui/table";
import {
  type QueuePriority,
  type QueueSourceType,
  type QueueStatus,
} from "@/generated/prisma/enums";
import {
  type QueueStageKey,
  getQueueStageForStatus,
  humanizeEnum,
  queuePriorityOptions,
  queueSourceTypeOptions,
  queueStageDefinitions,
  queueStageOptions,
  queueStatusOptions,
} from "@/lib/domain";
import { calculateRequestEstimate } from "@/lib/request-estimates";
import {
  estimateCalendarHoursFromMachineHours,
  estimateWorkItemTime,
  formatDurationHours,
  formatPercent,
} from "@/lib/processing-time-estimates";
import { getProductExternalUrl } from "@/lib/product-external-url";
import { formatDateTime } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { getQueueItems } from "@/server/services/queue-service";
import { getProcessingEstimateSettings } from "@/server/services/settings-service";

function formatWeightGrams(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }

  if (Math.abs(value - Math.round(value)) < 0.001) {
    return `${Math.round(value)} g`;
  }

  return `${value.toFixed(1).replace(/\.0$/, "")} g`;
}

const stageToneClassName: Record<string, string> = {
  success: "border-emerald-200 bg-emerald-100 text-emerald-800",
  info: "border-sky-200 bg-sky-100 text-sky-800",
  warning: "border-amber-200 bg-amber-100 text-amber-800",
  danger: "border-rose-200 bg-rose-100 text-rose-800",
  neutral: "border-slate-200 bg-slate-100 text-slate-700",
};

function stageBadgeClassName(stageKey: QueueStageKey) {
  const stage = queueStageDefinitions.find((definition) => definition.key === stageKey);
  return stageToneClassName[stage?.tone ?? "neutral"];
}

function priorityRowClassName(priority: QueuePriority) {
  if (priority === "URGENT") {
    return "queue-priority-highlight queue-priority-urgent";
  }

  if (priority === "HIGH") {
    return "queue-priority-highlight";
  }

  return "";
}

function buildQueueFilterUrl(filters: {
  stage?: QueueStageKey;
  status?: QueueStatus;
  sourceType?: QueueSourceType;
  priority?: QueuePriority;
}) {
  const params = new URLSearchParams();
  if (filters.stage) {
    params.set("stage", filters.stage);
  }
  if (filters.status) {
    params.set("status", filters.status);
  }
  if (filters.sourceType) {
    params.set("sourceType", filters.sourceType);
  }
  if (filters.priority) {
    params.set("priority", filters.priority);
  }

  const queryString = params.toString();
  return queryString ? `/admin/queue?${queryString}` : "/admin/queue";
}

export default async function AdminQueuePage({
  searchParams,
}: {
  searchParams: Promise<{
    stage?: string;
    status?: string;
    sourceType?: string;
    priority?: string;
    error?: string;
    success?: string;
  }>;
}) {
  const params = await searchParams;

  const stageFilter =
    params.stage && queueStageOptions.includes(params.stage as QueueStageKey)
      ? (params.stage as QueueStageKey)
      : undefined;
  const statusFilter =
    params.status && queueStatusOptions.includes(params.status as QueueStatus)
      ? (params.status as QueueStatus)
      : undefined;
  const sourceFilter =
    params.sourceType && queueSourceTypeOptions.includes(params.sourceType as QueueSourceType)
      ? (params.sourceType as QueueSourceType)
      : undefined;
  const priorityFilter =
    params.priority && queuePriorityOptions.includes(params.priority as QueuePriority)
      ? (params.priority as QueuePriority)
      : undefined;

  const [queueItems, products, users, processingSettings] = await Promise.all([
    getQueueItems({ status: statusFilter, sourceType: sourceFilter, priority: priorityFilter }),
    prisma.product.findMany({ where: { status: "ACTIVE" }, orderBy: { publicName: "asc" }, select: { id: true, publicName: true } }),
    prisma.user.findMany({
      where: { role: "REQUEST_USER", isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    getProcessingEstimateSettings(),
  ]);
  const queueRows = queueItems.map((item) => {
    const requestEstimate = calculateRequestEstimate({
      quantity: item.quantity,
      filamentScalePercent: item.filamentScalePercent,
      product: item.product,
    });
    const timeEstimate = estimateWorkItemTime({
      totalWeightGrams: requestEstimate.totalWeightGrams,
      quantity: item.quantity,
      settings: processingSettings,
    });

    return {
      item,
      totalWeightGrams: requestEstimate.totalWeightGrams,
      timeEstimate,
      stageKey: getQueueStageForStatus(item.status),
    };
  });
  const visibleRows = stageFilter ? queueRows.filter((row) => row.stageKey === stageFilter) : queueRows;
  const totalMachineHours = visibleRows.reduce(
    (sum, row) => sum + (row.timeEstimate?.totalHours ?? 0),
    0,
  );
  const totalCalendarHours = estimateCalendarHoursFromMachineHours(totalMachineHours, processingSettings);
  const unknownEstimateCount = visibleRows.filter((row) => row.timeEstimate === null).length;
  const rowCount = visibleRows.length;
  const stageCounts = queueStageDefinitions.map((definition) => ({
    key: definition.key,
    count: queueRows.filter((row) => row.stageKey === definition.key).length,
  }));
  const redirectTo = buildQueueFilterUrl({
    stage: stageFilter,
    status: statusFilter,
    sourceType: sourceFilter,
    priority: priorityFilter,
  });

  return (
    <div className="space-y-4">
      <PageHeader className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Queue</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Print Queue Management</h1>
        </div>
        <CreateQueueItemModalButton products={products} users={users} />
      </PageHeader>

      {params.error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{params.error}</p>
      ) : null}
      {params.success ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{params.success}</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Queue Workflow</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form action="/admin/queue" method="get" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <Select name="stage" defaultValue={stageFilter ?? ""}>
              <option value="">All stage groups</option>
              {queueStageDefinitions.map((stage) => (
                <option key={stage.key} value={stage.key}>
                  {stage.label}
                </option>
              ))}
            </Select>
            <Select name="status" defaultValue={params.status ?? ""}>
              <option value="">All statuses</option>
              {queueStatusOptions.map((status) => (
                <option key={status} value={status}>
                  {humanizeEnum(status)}
                </option>
              ))}
            </Select>
            <Select name="sourceType" defaultValue={params.sourceType ?? ""}>
              <option value="">All sources</option>
              {queueSourceTypeOptions.map((source) => (
                <option key={source} value={source}>
                  {humanizeEnum(source)}
                </option>
              ))}
            </Select>
            <Select name="priority" defaultValue={params.priority ?? ""}>
              <option value="">All priorities</option>
              {queuePriorityOptions.map((priority) => (
                <option key={priority} value={priority}>
                  {humanizeEnum(priority)}
                </option>
              ))}
            </Select>
            <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-4">
              <Button type="submit" variant="secondary">
                Apply Filters
              </Button>
              <Link
                href="/admin/queue"
                className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
              >
                Clear
              </Link>
            </div>
          </form>
          <div className="flex flex-wrap gap-2">
            <Link
              href={buildQueueFilterUrl({
                sourceType: sourceFilter,
                priority: priorityFilter,
                status: statusFilter,
              })}
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${
                !stageFilter
                  ? "border-slate-400 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              All Stages ({queueRows.length})
            </Link>
            {queueStageDefinitions.map((stage) => {
              const stageCount = stageCounts.find((item) => item.key === stage.key)?.count ?? 0;
              return (
                <Link
                  key={stage.key}
                  href={buildQueueFilterUrl({
                    stage: stage.key,
                    sourceType: sourceFilter,
                    priority: priorityFilter,
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

          <p className="text-xs text-slate-500">
            Showing {rowCount} queue item{rowCount === 1 ? "" : "s"} • Open any item to edit notes, priority, and state.
          </p>
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
                {unknownEstimateCount} queue item{unknownEstimateCount === 1 ? "" : "s"} missing weight estimates and excluded from totals.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {queueStageDefinitions.map((stage) => {
        const stageRows = visibleRows.filter((row) => row.stageKey === stage.key);
        const stageTotalUnits = stageRows.reduce((sum, row) => sum + row.item.quantity, 0);
        const stageMachineHours = stageRows.reduce((sum, row) => sum + (row.timeEstimate?.totalHours ?? 0), 0);
        const stageUnknownEstimateCount = stageRows.filter((row) => row.timeEstimate === null).length;
        const blockedCount = stageRows.filter((row) => row.item.status === "BLOCKED").length;
        const oldestCreatedAt =
          stageRows.length > 0
            ? new Date(Math.min(...stageRows.map((row) => row.item.createdAt.getTime())))
            : null;
        const defaultOpen = stage.key !== "CLOSED_EXCEPTION" || blockedCount > 0 || stageFilter === stage.key;

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
                      {oldestCreatedAt ? ` • Oldest created ${formatDateTime(oldestCreatedAt)}` : ""}
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
                  <p className="py-6 text-center text-sm text-slate-500">No items in this stage.</p>
                ) : (
                  <TableContainer>
                    <Table>
                      <thead>
                        <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                          <th className="px-2 py-2">Thumb</th>
                          <th className="px-2 py-2">Product</th>
                          <th className="px-2 py-2">Source</th>
                          <th className="px-2 py-2">Queue Source</th>
                          <th className="px-2 py-2">Qty</th>
                          <th className="px-2 py-2">Total Weight (g)</th>
                          <th className="px-2 py-2">Est Time</th>
                          <th className="px-2 py-2">Status</th>
                          <th className="px-2 py-2">Due</th>
                          <th className="px-2 py-2">Updated</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stageRows.map(({ item, totalWeightGrams, timeEstimate }) => {
                          const detailHref = `/admin/queue/${item.id}`;
                          const productExternalUrl = getProductExternalUrl(item.product);
                          const rowLinkClassName = "block h-full px-2 py-3 focus-visible:outline-none";

                          return (
                            <tr
                              key={item.id}
                              className={`border-b border-slate-100 align-top transition-colors hover:bg-slate-50 focus-within:bg-slate-50 ${priorityRowClassName(item.priority)}`}
                            >
                              <td className="p-0">
                                <Link href={detailHref} className={rowLinkClassName}>
                                  {item.product.images[0] ? (
                                    <div className="relative h-14 w-14 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                                      <Image
                                        src={item.product.images[0].imagePath}
                                        alt={item.product.publicName}
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
                                  <p className="font-medium text-slate-900">{item.product.publicName}</p>
                                  <p className="text-xs text-slate-500">
                                    Queue Item {item.id.slice(-8)} • Created {formatDateTime(item.createdAt)}
                                  </p>
                                </Link>
                              </td>
                              <td className="px-2 py-3 text-center">
                                {productExternalUrl ? (
                                  <a
                                    href={productExternalUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={productExternalUrl}
                                    aria-label={`Open external URL for ${item.product.publicName}`}
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
                                  <p>{humanizeEnum(item.sourceType)}</p>
                                  {item.sourceReferenceId ? (
                                    <p className="text-xs text-slate-500">Ref {item.sourceReferenceId}</p>
                                  ) : null}
                                  {item.requesterUser ? (
                                    <p className="text-xs text-slate-500">Requester {item.requesterUser.name}</p>
                                  ) : null}
                                </Link>
                              </td>
                              <td className="p-0 text-sm text-slate-700">
                                <Link href={detailHref} className={rowLinkClassName}>
                                  {item.quantity}
                                </Link>
                              </td>
                              <td className="p-0 text-xs text-slate-600">
                                <Link href={detailHref} className={rowLinkClassName}>
                                  {formatWeightGrams(totalWeightGrams)}
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
                              <td className="p-0">
                                <div className="space-y-2 px-2 py-3">
                                  <QueueStatusInlineEditor
                                    queueItemId={item.id}
                                    currentStatus={item.status}
                                    priority={item.priority}
                                    notes={item.notes}
                                    redirectTo={redirectTo}
                                  />
                                </div>
                              </td>
                              <td className="p-0 text-xs text-slate-500">
                                <Link href={detailHref} className={rowLinkClassName}>
                                  {formatDateTime(item.dueDate)}
                                </Link>
                              </td>
                              <td className="p-0 text-xs text-slate-500">
                                <Link href={detailHref} className={rowLinkClassName}>
                                  {formatDateTime(item.updatedAt)}
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
    </div>
  );
}
