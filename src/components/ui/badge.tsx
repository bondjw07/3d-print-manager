import { statusTone } from "@/lib/domain";
import { cn } from "@/lib/utils";

const toneClasses: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-800 border-emerald-200",
  info: "bg-sky-100 text-sky-800 border-sky-200",
  warning: "bg-amber-100 text-amber-800 border-amber-200",
  danger: "bg-rose-100 text-rose-800 border-rose-200",
  neutral: "bg-slate-100 text-slate-700 border-slate-200",
};

export function StatusBadge({ value, className }: { value: string; className?: string }) {
  const tone = statusTone[value] ?? "neutral";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        toneClasses[tone],
        className,
      )}
    >
      {value.replaceAll("_", " ")}
    </span>
  );
}
