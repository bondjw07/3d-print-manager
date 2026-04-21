import Link from "next/link";
import { type UserRole } from "@/generated/prisma/client";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TableContainer } from "@/components/ui/table";
import { userRoleLabels } from "@/lib/domain";
import { formatDateTime } from "@/lib/utils";
import { updateUserByAdminAction } from "@/server/actions/portal-actions";
import { getAdminUsers } from "@/server/services/user-service";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; active?: string; error?: string; success?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const roleFilter =
    params.role === "ADMIN" || params.role === "REQUEST_USER" ? (params.role as UserRole) : undefined;
  const activeFilter = params.active === "active" ? true : params.active === "inactive" ? false : undefined;

  const roleOptions = Object.keys(userRoleLabels) as UserRole[];

  const redirectParams = new URLSearchParams();
  if (q) {
    redirectParams.set("q", q);
  }
  if (roleFilter) {
    redirectParams.set("role", roleFilter);
  }
  if (params.active === "active" || params.active === "inactive") {
    redirectParams.set("active", params.active);
  }
  const redirectTo = redirectParams.toString() ? `/admin/users?${redirectParams.toString()}` : "/admin/users";

  const users = await getAdminUsers({
    q: q || undefined,
    role: roleFilter,
    isActive: activeFilter,
  });

  return (
    <div className="space-y-4">
      <PageHeader>
        <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Users</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">User Management</h1>
        <p className="mt-1 text-sm text-slate-600">View account details and manage user roles and account status.</p>
      </PageHeader>

      {params.error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{params.error}</p>
      ) : null}
      {params.success ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{params.success}</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>User Directory</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <form action="/admin/users" method="get" className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_180px_auto]">
            <Input name="q" defaultValue={q} placeholder="Search name or email" />
            <Select name="role" defaultValue={params.role ?? ""}>
              <option value="">All roles</option>
              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {userRoleLabels[role]}
                </option>
              ))}
            </Select>
            <Select name="active" defaultValue={params.active ?? ""}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
            <Button type="submit" variant="secondary">
              Filter
            </Button>
          </form>

          <TableContainer>
            <Table>
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2">User</th>
                  <th className="px-2 py-2">Role</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Activity</th>
                  <th className="px-2 py-2">Created</th>
                  <th className="px-2 py-2">Updated</th>
                  <th className="px-2 py-2">Manage</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-2 py-8 text-center text-sm text-slate-500">
                      No users matched the current filters.
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="border-b border-slate-100 align-top">
                      <td className="px-2 py-3 text-sm text-slate-700">
                        <Link href={`/admin/users/${user.id}`} className="font-medium text-slate-900 hover:underline">
                          {user.name}
                        </Link>
                        <p className="text-xs text-slate-500">{user.email}</p>
                      </td>
                      <td className="px-2 py-3 text-sm text-slate-700">{userRoleLabels[user.role]}</td>
                      <td className="px-2 py-3">
                        <StatusBadge value={user.isActive ? "ACTIVE" : "INACTIVE"} />
                      </td>
                      <td className="px-2 py-3 text-xs text-slate-600">
                        <p>{user._count.requests} requests</p>
                        <p>{user._count.queueItems} queue items</p>
                      </td>
                      <td className="px-2 py-3 text-xs text-slate-500">{formatDateTime(user.createdAt)}</td>
                      <td className="px-2 py-3 text-xs text-slate-500">{formatDateTime(user.updatedAt)}</td>
                      <td className="px-2 py-3">
                        <form action={updateUserByAdminAction} className="grid gap-2">
                          <input type="hidden" name="userId" value={user.id} />
                          <input type="hidden" name="redirectTo" value={redirectTo} />
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
                          <div className="flex items-center gap-2">
                            <Button type="submit" size="sm" variant="secondary">
                              Save
                            </Button>
                            <Link href={`/admin/users/${user.id}`} className="text-xs font-medium text-sky-700 underline">
                              Details
                            </Link>
                          </div>
                        </form>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </div>
  );
}
