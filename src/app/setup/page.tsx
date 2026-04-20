import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createInitialAdminAction } from "@/server/auth/actions";
import { listMockUsers } from "@/server/auth/mock-auth-provider";

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; testSetup?: string }>;
}) {
  const [users, params] = await Promise.all([listMockUsers(), searchParams]);
  const hasActiveAdmin = users.some((user) => user.role === "ADMIN");
  const setupTestModeEnabled = process.env.ENABLE_INITIAL_ADMIN_TEST_MODE === "true";
  const setupTestRequested = params.testSetup === "1";
  const allowSetupTest = hasActiveAdmin && setupTestModeEnabled && setupTestRequested;

  if (hasActiveAdmin && !allowSetupTest) {
    redirect("/login");
  }

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <Card>
        <CardHeader>
          <p className="text-xs uppercase tracking-[0.2em] text-accent-strong">Initial Setup</p>
          <CardTitle className="mt-2 text-xl">Step 1 of 1: Create Admin Account</CardTitle>
          <CardDescription>
            {allowSetupTest
              ? "Test mode is enabled. This simulates first-launch onboarding even when an admin already exists."
              : "Create the first administrator account before using the portal."}
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

          <form action={createInitialAdminAction} className="grid gap-3 rounded-2xl border border-border bg-surface-muted p-4">
            <label className="text-sm font-medium text-foreground" htmlFor="name">
              Admin name
            </label>
            <Input id="name" name="name" required placeholder="Jane Doe" />
            <label className="text-sm font-medium text-foreground" htmlFor="email">
              Admin email
            </label>
            <Input id="email" name="email" type="email" required placeholder="admin@example.com" />
            <label className="text-sm font-medium text-foreground" htmlFor="password">
              Password
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              placeholder="At least 8 characters"
            />
            <label className="text-sm font-medium text-foreground" htmlFor="confirmPassword">
              Confirm password
            </label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              placeholder="Re-enter password"
            />
            {allowSetupTest ? <input type="hidden" name="allowWhenAdminExists" value="1" /> : null}
            <Button type="submit" className="w-fit">
              Create Admin Account
            </Button>
          </form>

          {allowSetupTest ? (
            <Link href="/login" className="inline-block text-sm text-foreground underline">
              Exit setup test mode
            </Link>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
