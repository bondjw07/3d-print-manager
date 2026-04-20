import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

export function PageHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-surface/90 px-5 py-4 shadow-[0_12px_40px_-28px_rgba(15,23,42,0.4)]",
        className,
      )}
      {...props}
    />
  );
}
