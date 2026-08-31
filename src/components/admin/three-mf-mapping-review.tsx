"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { readApiResponse } from "@/lib/api-response";

type Mapping = { id: string; colorName: string; hexColor: string; materialType: string; effectType: string | null };
type Plate = { id: string; name: string; extruders: number[]; match: "exact" | "close" | "unmatched"; mappingId: string | null };

export function ThreeMfMappingReview(props: {
  productId: string;
  sourceFileId: string;
  entryPath: string | null;
  sourceName: string;
  plates: Plate[];
  mappings: Mapping[];
}) {
  const router = useRouter();
  const [selections, setSelections] = useState<Record<string, string>>(() => Object.fromEntries(props.plates.map((plate) => [plate.id, plate.mappingId ?? ""])));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const mappingsById = useMemo(() => new Map(props.mappings.map((mapping) => [mapping.id, mapping])), [props.mappings]);
  const missing = props.plates.filter((plate) => plate.extruders.length > 0 && !selections[plate.id]);

  return <div className="space-y-4">
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-medium">Complete P2S settings replacement</p>
      <p className="mt-1">This intentionally replaces the complete Bambu Studio project settings using the configured P2S reference. Review every plate mapping before generating the processed file.</p>
    </div>
    <div className="space-y-3">
      {props.plates.map((plate) => {
        const selected = mappingsById.get(selections[plate.id]);
        const needsAttention = plate.extruders.length > 0 && plate.match !== "exact";
        return <div key={plate.id} className={`grid gap-3 rounded-xl border p-3 md:grid-cols-[1fr_minmax(300px,1fr)] md:items-center ${needsAttention ? "border-amber-300 bg-amber-50/50" : "border-slate-200"}`}>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-slate-900">{plate.name}</p>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${plate.match === "exact" ? "bg-emerald-100 text-emerald-700" : plate.match === "close" ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-700"}`}>{plate.match}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">Plate {plate.id} · {plate.extruders.length ? `extruder ${plate.extruders.join(", ")}` : "no colorable objects"}</p>
          </div>
          <div className="grid grid-cols-[42px_1fr] items-center gap-2">
            <span className="h-10 w-10 rounded-lg border border-slate-300" style={{ background: selected?.hexColor ?? "repeating-linear-gradient(45deg,#e2e8f0 0 7px,#f8fafc 7px 14px)" }} />
            <div>
              <Select disabled={!plate.extruders.length || isPending} value={selections[plate.id]} onChange={(event) => setSelections((current) => ({ ...current, [plate.id]: event.target.value }))}>
                <option value="">Choose a PMP filament mapping…</option>
                {props.mappings.map((mapping) => <option key={mapping.id} value={mapping.id}>{mapping.colorName} · {mapping.materialType} {mapping.effectType || "Matte"} · {mapping.hexColor}</option>)}
              </Select>
              {selected ? <p className="mt-1 text-xs text-slate-500">P2S profile: {selected.materialType} {selected.effectType || "Matte"}</p> : null}
            </div>
          </div>
        </div>;
      })}
    </div>
    {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-500">Source: {props.sourceName}</p>
      <Button disabled={isPending || missing.length > 0} onClick={() => {
        setError(null);
        startTransition(async () => {
          try {
            const response = await fetch(`/api/admin/products/${props.productId}/files/process`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sourceFileId: props.sourceFileId, entryPath: props.entryPath, selections }),
            });
            const payload = await readApiResponse(response);
            if (!response.ok) throw new Error(payload.error ?? "Processing failed.");
            router.push(`/admin/products/${props.productId}/files?success=${encodeURIComponent("Processed P2S 3MF generated.")}`);
            router.refresh();
          } catch (processingError) {
            setError(processingError instanceof Error ? processingError.message : "Processing failed.");
          }
        });
      }}>{isPending ? "Applying…" : "Apply P2S Template & Map Colors"}</Button>
    </div>
  </div>;
}
