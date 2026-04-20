import { cn } from "@/lib/utils";
import type { TextareaHTMLAttributes } from "react";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none ring-sky-300 transition placeholder:text-foreground-muted focus:border-sky-400 focus:ring-2",
        className,
      )}
      {...props}
    />
  );
}
