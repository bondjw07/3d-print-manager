import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { humanizeEnum, requestStatusOptions } from "@/lib/domain";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { convertRequestToQueueAction, updateRequestByAdminAction } from "@/server/actions/portal-actions";
import { getRequestByIdForAdmin } from "@/server/services/request-service";

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

export default async function AdminRequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const request = await getRequestByIdForAdmin(id);

  if (!request) {
    notFound();
  }

  const redirectTo = `/admin/requests/${request.id}`;
  const hasLinkedQueueItems = request.queueItems.length > 0;
  const canConvertToQueue = request.status !== "QUEUED" && !hasLinkedQueueItems;

  return (
    <div className="space-y-4">
      <PageHeader>
        <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Request Detail</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{request.product.publicName}</h1>
        <p className="mt-1 text-sm text-slate-600">
          Requested by {request.requesterUser.name} ({request.requesterUser.email})
        </p>
        <Link href="/admin/requests" className="mt-2 inline-block text-xs font-medium text-sky-700 underline">
          Back to all requests
        </Link>
      </PageHeader>

      {query.error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{query.error}</p>
      ) : null}
      {query.success ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{query.success}</p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Request Summary</CardTitle>
              <CardDescription>Core request metadata and calculated print estimates.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-start gap-4">
                {request.product.images[0] ? (
                  <div className="relative h-28 w-28 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                    <Image
                      src={request.product.images[0].imagePath}
                      alt={request.product.publicName}
                      fill
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex h-28 w-28 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-500">
                    No Image
                  </div>
                )}

                <div className="space-y-2">
                  <StatusBadge value={request.status} />
                  <p className="text-sm text-slate-600">
                    Quantity <span className="font-semibold text-slate-900">{request.quantity}</span>
                  </p>
                  <p className="text-sm text-slate-600">
                    Model scale <span className="font-semibold text-slate-900">{formatScalePercent(request.modelScalePercent)}</span>
                  </p>
                  <p className="text-sm text-slate-600">
                    Filament scale{" "}
                    <span className="font-semibold text-slate-900">{formatScalePercent(request.filamentScalePercent)}</span>
                  </p>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Total Weight</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{formatWeightGrams(request.totalWeightGrams)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Calculated Cost</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {request.calculatedCost === null ? "—" : formatCurrency(request.calculatedCost)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Submitted</p>
                  <p className="mt-1 text-sm text-slate-900">{formatDateTime(request.createdAt)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Last Updated</p>
                  <p className="mt-1 text-sm text-slate-900">{formatDateTime(request.updatedAt)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
              <CardDescription>Requester notes and current admin notes for this request.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Requester Notes</p>
                {request.notes ? (
                  <p className="mt-1 whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-3 text-slate-700">{request.notes}</p>
                ) : (
                  <p className="mt-1 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-slate-500">None</p>
                )}
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Admin Notes</p>
                {request.adminNotes ? (
                  <p className="mt-1 whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-3 text-slate-700">
                    {request.adminNotes}
                  </p>
                ) : (
                  <p className="mt-1 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-slate-500">None</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Queue Links</CardTitle>
              <CardDescription>Queue items generated from this request.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {request.queueItems.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                  No queue items linked yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {request.queueItems.map((queueItem) => (
                    <div key={queueItem.id} className="rounded-xl border border-slate-200 px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium text-slate-900">Queue Item {queueItem.id.slice(-8)}</p>
                        <div className="flex gap-2">
                          <StatusBadge value={queueItem.status} />
                          <StatusBadge value={queueItem.priority} />
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Quantity {queueItem.quantity} • Created {formatDateTime(queueItem.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <Link href="/admin/queue?sourceType=REQUEST" className="inline-block text-xs font-medium text-sky-700 underline">
                Open queue board filtered to request work
              </Link>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Edit Request</CardTitle>
            <CardDescription>Update status, scales, and admin notes from one place.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form action={updateRequestByAdminAction} className="grid gap-3">
              <input type="hidden" name="requestId" value={request.id} />
              <input type="hidden" name="redirectTo" value={redirectTo} />
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor="status">
                  Status
                </label>
                <Select id="status" name="status" defaultValue={request.status}>
                  {requestStatusOptions.map((status) => (
                    <option key={status} value={status}>
                      {humanizeEnum(status)}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label
                  className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500"
                  htmlFor="modelScalePercent"
                >
                  Model Scale %
                </label>
                <Input
                  id="modelScalePercent"
                  name="modelScalePercent"
                  type="number"
                  step="0.01"
                  min={10}
                  max={400}
                  defaultValue={request.modelScalePercent.toString()}
                  placeholder="Model scale %"
                />
              </div>

              <div>
                <label
                  className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500"
                  htmlFor="filamentScalePercent"
                >
                  Filament Scale %
                </label>
                <Input
                  id="filamentScalePercent"
                  name="filamentScalePercent"
                  type="number"
                  step="0.01"
                  min={1}
                  max={400}
                  defaultValue={request.filamentScalePercent.toString()}
                  placeholder="Filament scale %"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor="adminNotes">
                  Admin Notes
                </label>
                <Textarea
                  id="adminNotes"
                  name="adminNotes"
                  defaultValue={request.adminNotes ?? ""}
                  placeholder="Admin notes"
                  className="min-h-[110px]"
                />
              </div>

              <Button type="submit">Save Request</Button>
            </form>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Convert to Queue</p>
              <p className="mt-1 text-xs text-slate-600">
                Create a linked queue item and set this request to queued status.
              </p>
              <form action={convertRequestToQueueAction} className="mt-3">
                <input type="hidden" name="requestId" value={request.id} />
                <input type="hidden" name="redirectTo" value={redirectTo} />
                <Button type="submit" variant="secondary" disabled={!canConvertToQueue}>
                  Convert Request To Queue Item
                </Button>
              </form>
              {!canConvertToQueue ? (
                <p className="mt-2 text-xs text-slate-500">
                  This request is already queued or already has linked queue work.
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
