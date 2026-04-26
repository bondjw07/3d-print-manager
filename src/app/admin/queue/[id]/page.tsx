import Image from "next/image";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { humanizeEnum, queuePriorityOptions, queueStatusOptions } from "@/lib/domain";
import { getProductExternalUrl } from "@/lib/product-external-url";
import { formatDateTime } from "@/lib/utils";
import { updateQueueItemAction } from "@/server/actions/portal-actions";
import { getQueueItemByIdForAdmin } from "@/server/services/queue-service";

export default async function AdminQueueItemDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const queueItem = await getQueueItemByIdForAdmin(id);

  if (!queueItem) {
    notFound();
  }

  const redirectTo = `/admin/queue/${queueItem.id}`;
  const productExternalUrl = getProductExternalUrl(queueItem.product);

  return (
    <div className="space-y-4">
      <PageHeader>
        <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Queue Item</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{queueItem.product.publicName}</h1>
        <p className="mt-1 text-sm text-slate-600">
          Queue ID {queueItem.id.slice(-8)} • Quantity {queueItem.quantity}
        </p>
        <Link href="/admin/queue" className="mt-2 inline-block text-xs font-medium text-sky-700 underline">
          Back to queue board
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
              <CardTitle>Queue Summary</CardTitle>
              <CardDescription>Current queue metadata and linked records.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-start gap-4">
                {queueItem.product.images[0] ? (
                  <div className="relative h-28 w-28 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                    <Image
                      src={queueItem.product.images[0].imagePath}
                      alt={queueItem.product.publicName}
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
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge value={queueItem.status} />
                    <StatusBadge value={queueItem.priority} />
                  </div>
                  <p className="text-sm text-slate-600">Source {humanizeEnum(queueItem.sourceType)}</p>
                  <p className="text-sm text-slate-600">
                    Product{" "}
                    <Link href={`/admin/products/${queueItem.product.id}`} className="font-medium text-sky-700 underline">
                      {queueItem.product.publicName}
                    </Link>
                  </p>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Quantity</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{queueItem.quantity}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Due Date</p>
                  <p className="mt-1 text-sm text-slate-900">{formatDateTime(queueItem.dueDate)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Created</p>
                  <p className="mt-1 text-sm text-slate-900">{formatDateTime(queueItem.createdAt)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Last Updated</p>
                  <p className="mt-1 text-sm text-slate-900">{formatDateTime(queueItem.updatedAt)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Requester</p>
                  {queueItem.requesterUser ? (
                    <p className="mt-1 text-sm text-slate-900">
                      {queueItem.requesterUser.name}
                      <span className="block text-xs text-slate-500">{queueItem.requesterUser.email}</span>
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-slate-500">No requester linked</p>
                  )}
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Source Reference</p>
                  <p className="mt-1 text-sm text-slate-900">{queueItem.sourceReferenceId || "None"}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 sm:col-span-2">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Source URL</p>
                  {productExternalUrl ? (
                    <a
                      href={productExternalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={productExternalUrl}
                      className="mt-1 inline-flex max-w-full items-center gap-1 text-sm text-sky-700 underline"
                    >
                      <span className="truncate">{productExternalUrl}</span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    </a>
                  ) : (
                    <p className="mt-1 text-sm text-slate-500">None</p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-slate-500">Linked Request</p>
                {queueItem.sourceRequest ? (
                  <p className="mt-1 text-sm text-slate-900">
                    <Link href={`/admin/requests/${queueItem.sourceRequest.id}`} className="font-medium text-sky-700 underline">
                      Request {queueItem.sourceRequest.id.slice(-8)}
                    </Link>
                    <span className="ml-1">({humanizeEnum(queueItem.sourceRequest.status)})</span>
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-slate-500">No linked request</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Operational Notes</CardTitle>
            </CardHeader>
            <CardContent>
              {queueItem.notes ? (
                <p className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                  {queueItem.notes}
                </p>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                  No notes yet.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Edit Queue Item</CardTitle>
            <CardDescription>Update state, priority, and internal notes.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={updateQueueItemAction} className="grid gap-3">
              <input type="hidden" name="queueItemId" value={queueItem.id} />
              <input type="hidden" name="redirectTo" value={redirectTo} />
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor="status">
                  State
                </label>
                <Select id="status" name="status" defaultValue={queueItem.status}>
                  {queueStatusOptions.map((status) => (
                    <option key={status} value={status}>
                      {humanizeEnum(status)}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor="priority">
                  Priority
                </label>
                <Select id="priority" name="priority" defaultValue={queueItem.priority}>
                  {queuePriorityOptions.map((priority) => (
                    <option key={priority} value={priority}>
                      {humanizeEnum(priority)}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor="notes">
                  Notes
                </label>
                <Textarea id="notes" name="notes" defaultValue={queueItem.notes ?? ""} className="min-h-[130px]" />
              </div>

              <Button type="submit">Save Queue Item</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
