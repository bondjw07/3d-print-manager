import Link from "next/link";
import { type SessionUser } from "@/server/auth/mock-auth-provider";
import { userRoleLabels } from "@/lib/domain";
import { AccountMenu } from "@/components/layout/account-menu";

export function SiteHeader({ user, initialTheme }: { user: SessionUser | null; initialTheme: "light" | "dark" }) {
  const accountMenuUser = user
    ? {
        name: user.name,
        email: user.email,
        role: user.role,
        roleLabel: userRoleLabels[user.role],
      }
    : null;

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
              <Link href="/requests" className="hover:text-foreground">
                Requests
              </Link>
            ) : null}
            {user?.role === "ADMIN" ? (
              <Link href="/admin" className="hover:text-foreground">
                Admin
              </Link>
            ) : null}
          </nav>
        </div>

        <AccountMenu user={accountMenuUser} initialTheme={initialTheme} />
      </div>
    </header>
  );
}
