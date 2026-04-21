"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/filaments", label: "Filaments" },
  { href: "/admin/listings", label: "Listings" },
  { href: "/admin/requests", label: "Requests" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/queue", label: "Queue" },
  { href: "/admin/inventory", label: "Inventory" },
  { href: "/admin/settings", label: "Settings" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="space-y-1">
      {navItems.map((item) => {
        const active = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center rounded-xl px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sky-100 text-sky-900"
                : "text-foreground-muted hover:bg-surface-muted hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
