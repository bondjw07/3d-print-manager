"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function P2sReferenceUpload() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  return <div className="space-y-2">
    <div className="flex flex-wrap items-end gap-2">
      <label className="grid min-w-64 flex-1 gap-1 text-sm font-medium text-slate-800">P2S reference 3MF<input ref={inputRef} className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" type="file" accept=".3mf,model/3mf" /></label>
      <Button type="button" variant="secondary" disabled={isPending} onClick={() => {
        const file = inputRef.current?.files?.[0];
        if (!file) { setError("Choose a P2S reference 3MF."); return; }
        setError(null); setSuccess(null);
        startTransition(async () => {
          try {
            const response = await fetch(`/api/admin/settings/p2s-reference?fileName=${encodeURIComponent(file.name)}`, {
              method: "POST",
              body: file,
              headers: { "Content-Type": file.type || "model/3mf" },
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error ?? "Upload failed.");
            if (inputRef.current) inputRef.current.value = "";
            setSuccess("P2S reference saved and validated.");
            router.refresh();
          } catch (uploadError) {
            setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
          }
        });
      }}>{isPending ? "Validating…" : "Replace P2S Reference"}</Button>
    </div>
    {error ? <p className="text-xs text-rose-600">{error}</p> : null}
    {success ? <p className="text-xs text-emerald-600">{success}</p> : null}
  </div>;
}
