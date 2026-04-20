import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { continueAsGuestAction, createInitialAdminAction, loginAsUserAction } from "@/server/auth/actions";
import { listMockUsers } from "@/server/auth/mock-auth-provider";
import { userRoleLabels } from "@/lib/domain";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const users = await listMockUsers();
  const params = await searchParams;
  const hasActiveAdmin = users.some((user) => user.role === "ADMIN");

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <Card>
        <CardHeader>
          <CardTitle>Sign In</CardTitle>
          <CardDescription>
            Use an existing account, or create the first admin account on first launch.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {params.error ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{params.error}</p>
          ) : null}
          {params.success ? (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {params.success}
            </p>
          ) : null}

          {!hasActiveAdmin ? (
            <form action={createInitialAdminAction} className="grid gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4">
              <p className="text-sm font-medium text-slate-900">Initial setup required</p>
              <p className="text-sm text-slate-700">
                No active admin user exists yet. Create the first admin account to finish setup.
              </p>
              <label className="text-sm font-medium text-slate-700" htmlFor="name">
                Admin name
              </label>
              <Input id="name" name="name" required placeholder="Jane Doe" />
              <label className="text-sm font-medium text-slate-700" htmlFor="email">
                Admin email
              </label>
              <Input id="email" name="email" type="email" required placeholder="admin@example.com" />
              <Button type="submit" className="w-fit">
                Create Initial Admin
              </Button>
            </form>
          ) : null}

          {users.length > 0 ? (
            <form action={loginAsUserAction} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <label className="text-sm font-medium text-slate-700" htmlFor="userId">
                Select account
              </label>
              <Select id="userId" name="userId" defaultValue="" required>
                <option value="" disabled>
                  Choose an account
                </option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({userRoleLabels[user.role]})
                  </option>
                ))}
              </Select>
              <Button type="submit" className="w-fit">
                Continue as selected user
              </Button>
            </form>
          ) : (
            <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              No active users are available yet.
            </p>
          )}

          <form action={continueAsGuestAction}>
            <Button type="submit" variant="secondary">
              Continue as guest
            </Button>
          </form>

          {users.length > 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              <p className="font-medium text-slate-900">Active accounts</p>
              <ul className="mt-2 space-y-1">
                {users.map((user) => (
                  <li key={user.id}>
                    {user.email} - {userRoleLabels[user.role]}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
