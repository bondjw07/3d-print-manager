import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TableContainer } from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import { requireRole } from "@/server/auth/mock-auth-provider";
import { submitRequestAction } from "@/server/actions/portal-actions";
import { getRequestsForUser } from "@/server/services/request-service";
import { prisma } from "@/lib/prisma";

export default async function MyRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const [user, params] = await Promise.all([requireRole("REQUEST_USER"), searchParams]);

  const [requests, requestableProducts] = await Promise.all([
    getRequestsForUser(user.id),
    prisma.product.findMany({
      where: {
        isPublic: true,
        isRequestable: true,
        status: "ACTIVE",
      },
      orderBy: { publicName: "asc" },
    }),
  ]);

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <Card>
        <CardHeader>
          <CardTitle>My Print Requests</CardTitle>
          <CardDescription>Submit and track requests across review, queue, and completion stages.</CardDescription>
        </CardHeader>
        <CardContent>
          {params.error ? (
            <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{params.error}</p>
          ) : null}
          {params.success ? (
            <p className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {params.success}
            </p>
          ) : null}

          <form action={submitRequestAction} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
            <input type="hidden" name="redirectTo" value="/my-requests" />
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="productId">
                Product
              </label>
              <Select id="productId" name="productId" required defaultValue="">
                <option value="" disabled>
                  Choose a product
                </option>
                {requestableProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.publicName}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="quantity">
                Quantity
              </label>
              <Input id="quantity" name="quantity" type="number" min={1} max={50} defaultValue={1} required />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="notes">
                Notes
              </label>
              <Textarea id="notes" name="notes" placeholder="Optional notes for admins" />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" className="w-fit">
                Submit Request
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {requests.length === 0 ? (
        <EmptyState title="No requests yet" description="Submit your first request to start tracking production." />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Request History</CardTitle>
          </CardHeader>
          <CardContent>
            <TableContainer>
              <Table>
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2">Quantity</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Submitted</th>
                    <th className="px-3 py-2">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((request) => (
                    <tr key={request.id} className="border-b border-slate-100 align-top">
                      <td className="px-3 py-3">
                        <p className="font-medium text-slate-900">{request.product.publicName}</p>
                      </td>
                      <td className="px-3 py-3 text-slate-700">{request.quantity}</td>
                      <td className="px-3 py-3">
                        <StatusBadge value={request.status} />
                      </td>
                      <td className="px-3 py-3 text-slate-700">{formatDateTime(request.createdAt)}</td>
                      <td className="px-3 py-3 text-slate-600">
                        {request.adminNotes ? (
                          <p className="mb-1 text-xs text-emerald-700">Admin: {request.adminNotes}</p>
                        ) : null}
                        <p className="text-xs">{request.notes || "-"}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
