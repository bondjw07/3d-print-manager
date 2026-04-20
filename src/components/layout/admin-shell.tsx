import Link from "next/link";
import { type SessionUser } from "@/server/auth/mock-auth-provider";
import { userRoleLabels } from "@/lib/domain";
import { AdminNav } from "./admin-nav";

export function AdminShell({ children, user }: { children: React.ReactNode; user: SessionUser }) {
  return (
    <div className="admin-shell-bg min-h-screen">
      <div className="mx-auto flex w-full max-w-[1440px] gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <aside className="hidden w-64 shrink-0 rounded-3xl border border-border bg-surface/90 p-4 shadow-[0_20px_80px_-48px_rgba(2,6,23,0.4)] lg:block">
          <Link href="/admin" className="mb-6 block rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-slate-950">
            3D Print Ops Console
          </Link>
          <AdminNav />
          <div className="mt-6 rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs">
            <p className="font-medium text-foreground">{user.name}</p>
            <p className="text-foreground-muted">{userRoleLabels[user.role]}</p>
          </div>
        </aside>
        <div className="min-w-0 flex-1 space-y-5">{children}</div>
      </div>
    </div>
  );
}
