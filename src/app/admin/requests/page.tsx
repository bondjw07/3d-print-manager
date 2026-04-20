import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TableContainer } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/utils";
import { humanizeEnum, requestStatusOptions } from "@/lib/domain";
import {
  convertRequestToQueueAction,
  updateRequestByAdminAction,
} from "@/server/actions/portal-actions";
import { getAllRequests } from "@/server/services/request-service";

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const [params, requests] = await Promise.all([searchParams, getAllRequests()]);

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
        <CardContent>
          <TableContainer>
            <Table>
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2">Requester</th>
                  <th className="px-2 py-2">Product</th>
                  <th className="px-2 py-2">Qty</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Submitted</th>
                  <th className="px-2 py-2">Admin Actions</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => (
                  <tr key={request.id} className="border-b border-slate-100 align-top">
                    <td className="px-2 py-3 text-sm text-slate-700">
                      <p className="font-medium text-slate-900">{request.requesterUser.name}</p>
                      <p className="text-xs text-slate-500">{request.requesterUser.email}</p>
                    </td>
                    <td className="px-2 py-3 text-sm text-slate-700">{request.product.publicName}</td>
                    <td className="px-2 py-3 text-sm text-slate-700">{request.quantity}</td>
                    <td className="px-2 py-3">
                      <StatusBadge value={request.status} />
                    </td>
                    <td className="px-2 py-3 text-xs text-slate-500">{formatDateTime(request.createdAt)}</td>
                    <td className="px-2 py-3">
                      <form action={updateRequestByAdminAction} className="grid gap-2">
                        <input type="hidden" name="requestId" value={request.id} />
                        <input type="hidden" name="redirectTo" value="/admin/requests" />
                        <Select name="status" defaultValue={request.status}>
                          {requestStatusOptions.map((status) => (
                            <option key={status} value={status}>
                              {humanizeEnum(status)}
                            </option>
                          ))}
                        </Select>
                        <Textarea name="adminNotes" defaultValue={request.adminNotes ?? ""} placeholder="Admin notes" />
                        <div className="flex flex-wrap gap-2">
                          <Button type="submit" variant="secondary" size="sm">
                            Save
                          </Button>
                          <Button type="submit" formAction={convertRequestToQueueAction} size="sm">
                            Convert to Queue
                          </Button>
                        </div>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </div>
  );
}
