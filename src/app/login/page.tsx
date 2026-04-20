import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { continueAsGuestAction, loginAsUserAction } from "@/server/auth/actions";
import { listMockUsers } from "@/server/auth/mock-auth-provider";
import { userRoleLabels } from "@/lib/domain";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const users = await listMockUsers();
  const params = await searchParams;

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <Card>
        <CardHeader>
          <CardTitle>Mock Account Access</CardTitle>
          <CardDescription>
            Switch between Guest, Request User, and Admin personas for local development.
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

          <form action={loginAsUserAction} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <label className="text-sm font-medium text-slate-700" htmlFor="userId">
              Select seeded user
            </label>
            <Select id="userId" name="userId" defaultValue="" required>
              <option value="" disabled>
                Choose a user
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

          <form action={continueAsGuestAction}>
            <Button type="submit" variant="secondary">
              Continue as guest
            </Button>
          </form>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            <p className="font-medium text-slate-900">Seeded credentials</p>
            <ul className="mt-2 space-y-1">
              {users.map((user) => (
                <li key={user.id}>
                  {user.email} - {userRoleLabels[user.role]}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
