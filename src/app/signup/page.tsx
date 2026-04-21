import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { signupRequestUserAction } from "@/server/auth/actions";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <Card>
        <CardHeader>
          <CardTitle>Sign Up</CardTitle>
          <CardDescription>Create a request account to submit and track print requests.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {params.error ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{params.error}</p>
          ) : null}

          <form action={signupRequestUserAction} className="grid gap-3 rounded-2xl border border-border bg-surface-muted p-4">
            <label className="text-sm font-medium text-foreground" htmlFor="name">
              Name
            </label>
            <Input id="name" name="name" required placeholder="Jane Doe" />
            <label className="text-sm font-medium text-foreground" htmlFor="email">
              Email
            </label>
            <Input id="email" name="email" type="email" autoComplete="username" required placeholder="you@example.com" />
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
            <Button type="submit" className="w-fit">
              Create Account
            </Button>
          </form>

          <Link href="/login" className="inline-block text-sm text-foreground underline">
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
