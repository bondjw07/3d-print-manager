"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { logoutAction } from "@/server/auth/actions";
import { ThemeToggle } from "@/components/theme/theme-toggle";

type Theme = "light" | "dark";

type AccountMenuUser = {
  name: string;
  email: string;
  role: "ADMIN" | "REQUEST_USER";
  roleLabel: string;
};

type AccountMenuProps = {
  user: AccountMenuUser | null;
  initialTheme: Theme;
};

const menuItemClass =
  "block rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface-muted";

export function AccountMenu({ user, initialTheme }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const userInitial = user?.name.trim().charAt(0).toUpperCase() || "A";

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-surface px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-surface-muted"
      >
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-sky-300/90 text-sm font-semibold text-slate-900">
          {userInitial}
        </span>
        <span className="hidden max-w-32 truncate pr-1 text-sm sm:block">{user?.name ?? "Account"}</span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-12 z-50 w-max min-w-52 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-surface p-3 shadow-[0_20px_55px_-28px_rgba(15,23,42,0.55)]"
        >
          {user ? (
            <div className="border-b border-border px-2 pb-3 text-foreground-muted">
              <p className="text-base font-semibold text-foreground">{user.name}</p>
              <p className="max-w-full text-sm break-all">{user.email}</p>
              <p className="mt-1 text-xs">{user.roleLabel}</p>
            </div>
          ) : null}

          {user ? (
            <div className={user ? "mt-2" : undefined}>
              <Link href="/requests" className={menuItemClass} onClick={() => setOpen(false)}>
                Requests
              </Link>
            </div>
          ) : null}

          {user?.role === "ADMIN" ? (
            <div className={user ? "mt-2" : undefined}>
              <Link href="/admin" className={menuItemClass} onClick={() => setOpen(false)}>
                Admin
              </Link>
            </div>
          ) : null}

          <div className="mt-1">
            <ThemeToggle
              mode="menu-item"
              className={menuItemClass}
              initialTheme={initialTheme}
              onToggle={() => setOpen(false)}
            />
          </div>

          {user ? (
            <form action={logoutAction} className="mt-1" onSubmit={() => setOpen(false)}>
              <button type="submit" className={`${menuItemClass} w-full`}>
                Sign out
              </button>
            </form>
          ) : (
            <div className="mt-1">
              <Link href="/login" className={menuItemClass} onClick={() => setOpen(false)}>
                Sign In
              </Link>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
