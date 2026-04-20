import Link from "next/link";
import { logoutAction } from "@/server/auth/actions";
import { type SessionUser } from "@/server/auth/mock-auth-provider";
import { Button } from "@/components/ui/button";
import { userRoleLabels } from "@/lib/domain";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export function SiteHeader({ user }: { user: SessionUser | null }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link href="/catalog" className="text-sm font-semibold tracking-tight text-foreground">
            3D Print Management Portal
          </Link>
          <nav className="hidden items-center gap-4 text-sm text-foreground-muted md:flex">
            <Link href="/catalog" className="hover:text-foreground">
              Catalog
            </Link>
            {user?.role === "REQUEST_USER" ? (
              <Link href="/my-requests" className="hover:text-foreground">
                My Requests
              </Link>
            ) : null}
            {user?.role === "ADMIN" ? (
              <Link href="/admin" className="hover:text-foreground">
                Admin
              </Link>
            ) : null}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          {user ? (
            <>
              <div className="hidden rounded-xl border border-border bg-surface px-3 py-2 text-right text-xs text-foreground-muted sm:block">
                <p className="font-medium text-foreground">{user.name}</p>
                <p>{userRoleLabels[user.role]}</p>
              </div>
              <form action={logoutAction}>
                <Button variant="secondary" size="sm" type="submit">
                  Sign out
                </Button>
              </form>
            </>
          ) : (
            <Link href="/login">
              <Button size="sm">Mock Login</Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
