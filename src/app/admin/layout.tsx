import { AdminShell } from "@/components/layout/admin-shell";
import { requireRole } from "@/server/auth/mock-auth-provider";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("ADMIN");

  return <AdminShell user={user}>{children}</AdminShell>;
}
