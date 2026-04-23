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

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const [params, requests] = await Promise.all([searchParams, getAllRequests()]);
  const redirectTo = "/admin/requests";

  return (
    <div className="space-y-4">
      <PageHeader>
        <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Requests</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Request Management</h1>
      </PageHeader>

      {params.error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{params.error}</p>
      ) : null}
      {params.success ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{params.success}</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>All Requests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
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
                        totalCount={requests.length}
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
                  <th className="px-2 py-2">Request Notes</th>
                  <th className="px-2 py-2">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => {
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
        </CardContent>
      </Card>
    </div>
  );
}
