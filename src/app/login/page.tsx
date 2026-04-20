import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { continueAsGuestAction, loginAsUserAction } from "@/server/auth/actions";
import { listMockUsers } from "@/server/auth/mock-auth-provider";
import { userRoleLabels } from "@/lib/domain";
import Link from "next/link";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const users = await listMockUsers();
  const params = await searchParams;
  const hasActiveAdmin = users.some((user) => user.role === "ADMIN");
  const setupTestModeEnabled = process.env.ENABLE_INITIAL_ADMIN_TEST_MODE === "true";

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

          {setupTestModeEnabled ? (
            <div className="rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm text-foreground">
              Need to validate first-launch setup?
              <Link href="/setup?testSetup=1" className="ml-1 font-medium underline">
                Test Initial Setup Wizard
              </Link>
            </div>
          ) : null}

          {users.length > 0 ? (
            <form action={loginAsUserAction} className="grid gap-3 rounded-2xl border border-border bg-surface-muted p-4">
              <label className="text-sm font-medium text-foreground" htmlFor="userId">
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
            <div className="rounded-2xl border border-border bg-surface-muted px-4 py-3 text-sm text-foreground-muted">
              <p>No active users are available yet.</p>
              {!hasActiveAdmin ? (
                <Link href="/setup" className="mt-1 inline-block font-medium text-foreground underline">
                  Continue setup
                </Link>
              ) : null}
            </div>
          )}

          <form action={continueAsGuestAction}>
            <Button type="submit" variant="secondary">
              Continue as guest
            </Button>
          </form>

          {users.length > 0 ? (
            <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-foreground-muted">
              <p className="font-medium text-foreground">Active accounts</p>
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
