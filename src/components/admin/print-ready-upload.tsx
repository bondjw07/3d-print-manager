"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { readApiResponse } from "@/lib/api-response";

export function PrintReadyUpload({ productId }: { productId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const uploadPrintReadyFile = async () => {
    const file = inputRef.current?.files?.[0];
    if (!file) { setError("Choose a .gcode.3mf file."); return; }
    if (!file.name.toLowerCase().endsWith(".gcode.3mf")) { setError("Print-ready files must use the .gcode.3mf extension."); return; }
    setError(null);
    setSuccess(null);
    setIsUploading(true);
    try {
      const response = await fetch(`/api/admin/products/${productId}/files/print-ready?fileName=${encodeURIComponent(file.name)}`, {
        method: "POST",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      const payload = await readApiResponse(response);
      if (!response.ok) throw new Error(payload.error ?? "Upload failed.");
      if (inputRef.current) inputRef.current.value = "";
      setSuccess("Print-ready file uploaded.");
      router.refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  return <div className="space-y-2">
    <div className="flex flex-wrap items-end gap-2">
      <label className="grid min-w-64 flex-1 gap-1 text-sm font-medium text-slate-800">Bambu Studio print-ready file
        <input ref={inputRef} disabled={isUploading} className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" type="file" accept=".gcode.3mf" />
      </label>
      <Button type="button" disabled={isUploading} onClick={() => void uploadPrintReadyFile()}>
        {isUploading ? "Uploading…" : "Upload Print-Ready File"}
      </Button>
    </div>
    {error ? <p className="text-xs text-rose-600">{error}</p> : null}
    {success ? <p className="text-xs text-emerald-600">{success}</p> : null}
  </div>;
}
