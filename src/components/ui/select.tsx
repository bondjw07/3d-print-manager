import { cn } from "@/lib/utils";
import type { SelectHTMLAttributes } from "react";

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none ring-sky-300 transition focus:border-sky-400 focus:ring-2",
        className,
      )}
      {...props}
    />
  );
}
