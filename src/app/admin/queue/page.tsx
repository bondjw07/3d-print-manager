import Image from "next/image";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { CreateQueueItemModalButton } from "@/components/admin/create-queue-item-modal-button";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TableContainer } from "@/components/ui/table";
import {
  type QueuePriority,
  type QueueSourceType,
  type QueueStatus,
} from "@/generated/prisma/enums";
import {
  humanizeEnum,
  queuePriorityOptions,
  queueSourceTypeOptions,
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

export default async function AdminQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; sourceType?: string; priority?: string; error?: string; success?: string }>;
}) {
  const params = await searchParams;

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
  const queueItemsWithEstimates = queueItems.map((item) => {
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
    };
  });
  const totalMachineHours = queueItemsWithEstimates.reduce(
    (sum, row) => sum + (row.timeEstimate?.totalHours ?? 0),
    0,
  );
  const totalCalendarHours = estimateCalendarHoursFromMachineHours(totalMachineHours, processingSettings);
  const unknownEstimateCount = queueItemsWithEstimates.filter((row) => row.timeEstimate === null).length;

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
          <CardTitle>Queue Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form action="/admin/queue" method="get" className="grid gap-2 sm:grid-cols-3">
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
            <div className="flex gap-2">
              <Select name="priority" defaultValue={params.priority ?? ""}>
                <option value="">All priorities</option>
                {queuePriorityOptions.map((priority) => (
                  <option key={priority} value={priority}>
                    {humanizeEnum(priority)}
                  </option>
                ))}
              </Select>
              <Button type="submit" variant="secondary">
                Filter
              </Button>
            </div>
          </form>
          <p className="text-xs text-slate-500">Open any queue item to edit notes, priority, and state.</p>
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
                  <th className="px-2 py-2">Status / Priority</th>
                  <th className="px-2 py-2">Due</th>
                  <th className="px-2 py-2">Updated</th>
                </tr>
              </thead>
              <tbody>
                {queueItemsWithEstimates.map(({ item, totalWeightGrams, timeEstimate }) => {
                  const detailHref = `/admin/queue/${item.id}`;
                  const productExternalUrl = getProductExternalUrl(item.product);
                  const rowLinkClassName =
                    "block h-full px-2 py-3 transition-colors hover:bg-slate-50 focus-visible:bg-sky-50 focus-visible:outline-none";

                  return (
                    <tr key={item.id} className="border-b border-slate-100 align-top">
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
                        <Link href={detailHref} className={rowLinkClassName}>
                          <div className="space-y-1">
                            <StatusBadge value={item.status} />
                            <StatusBadge value={item.priority} />
                          </div>
                        </Link>
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
                {queueItemsWithEstimates.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-2 py-10 text-center text-sm text-slate-500">
                      No queue items match the current filters.
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
