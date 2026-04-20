import { cn } from "@/lib/utils";
import type { InputHTMLAttributes } from "react";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm text-foreground outline-none ring-sky-300 transition placeholder:text-foreground-muted focus:border-sky-400 focus:ring-2",
        className,
      )}
      {...props}
    />
  );
}
