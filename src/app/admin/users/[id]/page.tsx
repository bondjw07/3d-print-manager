import Link from "next/link";
import { notFound } from "next/navigation";
import { type UserRole } from "@/generated/prisma/client";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TableContainer } from "@/components/ui/table";
import { humanizeEnum, userRoleLabels } from "@/lib/domain";
import { formatDateTime } from "@/lib/utils";
import { updateUserByAdminAction } from "@/server/actions/portal-actions";
import { getAdminUserById } from "@/server/services/user-service";

export default async function AdminUserDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const user = await getAdminUserById(id);

  if (!user) {
    notFound();
  }

  const roleOptions = Object.keys(userRoleLabels) as UserRole[];

  return (
    <div className="space-y-4">
      <PageHeader>
        <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Users</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{user.name}</h1>
        <p className="mt-1 text-sm text-slate-600">{user.email}</p>
      </PageHeader>

      {query.error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{query.error}</p>
      ) : null}
      {query.success ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{query.success}</p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>Account Details</CardTitle>
            <Link href="/admin/users" className="text-sm font-medium text-sky-700 underline">
              Back to Users
            </Link>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Role</p>
              <p className="mt-1 text-sm font-medium text-slate-900">{userRoleLabels[user.role]}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Status</p>
              <div className="mt-1">
                <StatusBadge value={user.isActive ? "ACTIVE" : "INACTIVE"} />
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Created</p>
              <p className="mt-1 text-sm text-slate-700">{formatDateTime(user.createdAt)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Last Updated</p>
              <p className="mt-1 text-sm text-slate-700">{formatDateTime(user.updatedAt)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Total Requests</p>
              <p className="mt-1 text-sm text-slate-700">{user._count.requests}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Total Queue Items</p>
              <p className="mt-1 text-sm text-slate-700">{user._count.queueItems}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs uppercase tracking-wide text-slate-500">User ID</p>
              <code className="mt-1 block rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700">
                {user.id}
              </code>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Manage Access</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={updateUserByAdminAction} className="grid gap-2">
              <input type="hidden" name="userId" value={user.id} />
              <input type="hidden" name="redirectTo" value={`/admin/users/${user.id}`} />
              <Select name="role" defaultValue={user.role}>
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {userRoleLabels[role]}
                  </option>
                ))}
              </Select>
              <Select name="isActive" defaultValue={user.isActive ? "true" : "false"}>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </Select>
              <Button type="submit">Save Changes</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>Recent Requests</CardTitle>
            <Link href="/admin/requests" className="text-xs font-medium text-sky-700 underline">
              Open Requests
            </Link>
          </CardHeader>
          <CardContent>
            {user.requests.length === 0 ? (
              <p className="text-sm text-slate-500">No requests found for this user.</p>
            ) : (
              <TableContainer>
                <Table>
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-2 py-2">Product</th>
                      <th className="px-2 py-2">Qty</th>
                      <th className="px-2 py-2">Status</th>
                      <th className="px-2 py-2">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {user.requests.map((request) => (
                      <tr key={request.id} className="border-b border-slate-100">
                        <td className="px-2 py-2 text-sm text-slate-700">{request.product.publicName}</td>
                        <td className="px-2 py-2 text-sm text-slate-700">{request.quantity}</td>
                        <td className="px-2 py-2">
                          <StatusBadge value={request.status} />
                        </td>
                        <td className="px-2 py-2 text-xs text-slate-500">{formatDateTime(request.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>Recent Queue Items</CardTitle>
            <Link href="/admin/queue" className="text-xs font-medium text-sky-700 underline">
              Open Queue
            </Link>
          </CardHeader>
          <CardContent>
            {user.queueItems.length === 0 ? (
              <p className="text-sm text-slate-500">No queue items found for this user.</p>
            ) : (
              <TableContainer>
                <Table>
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-2 py-2">Product</th>
                      <th className="px-2 py-2">Source</th>
                      <th className="px-2 py-2">Qty</th>
                      <th className="px-2 py-2">Status</th>
                      <th className="px-2 py-2">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {user.queueItems.map((item) => (
                      <tr key={item.id} className="border-b border-slate-100">
                        <td className="px-2 py-2 text-sm text-slate-700">{item.product.publicName}</td>
                        <td className="px-2 py-2 text-sm text-slate-700">{humanizeEnum(item.sourceType)}</td>
                        <td className="px-2 py-2 text-sm text-slate-700">{item.quantity}</td>
                        <td className="px-2 py-2">
                          <div className="space-y-1">
                            <StatusBadge value={item.status} />
                            <StatusBadge value={item.priority} />
                          </div>
                        </td>
                        <td className="px-2 py-2 text-xs text-slate-500">{formatDateTime(item.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
