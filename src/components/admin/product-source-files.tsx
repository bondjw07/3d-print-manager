"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { readApiResponse } from "@/lib/api-response";

type Candidate = { entryPath: string | null; fileName: string; sizeBytes: string };
type Manifest = { kind: "THREE_MF" | "ZIP" | "OTHER"; threeMfCandidates: Candidate[]; entryCount?: number };
type SourceFile = {
  id: string;
  originalName: string;
  mediaType: string | null;
  sizeBytes: string;
  sha256: string;
  createdAt: string;
  packageManifest: Manifest | null;
};

function formatBytes(value: string) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return value;
  const units = ["B", "KiB", "MiB", "GiB"];
  let amount = bytes;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount >= 10 || unit === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[unit]}`;
}

export function ProductSourceFiles({ productId, sourceFiles }: { productId: string; sourceFiles: SourceFile[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const uploadFiles = (files: File[]) => {
    if (!files.length) return;
    setError(null);
    setStatus(`Uploading 1 of ${files.length}…`);
    startTransition(async () => {
      try {
        for (let index = 0; index < files.length; index += 1) {
          const file = files[index];
          setStatus(`Uploading ${index + 1} of ${files.length}: ${file.name}`);
          const response = await fetch(
            `/api/admin/products/${encodeURIComponent(productId)}/files/source?fileName=${encodeURIComponent(file.name)}`,
            { method: "POST", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } },
          );
          const payload = await readApiResponse(response);
          if (!response.ok) throw new Error(`${file.name}: ${payload.error ?? "Upload failed."}`);
        }
        if (inputRef.current) inputRef.current.value = "";
        setStatus(`${files.length} source file${files.length === 1 ? "" : "s"} uploaded.`);
        router.refresh();
      } catch (uploadError) {
        setStatus(null);
        setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
        router.refresh();
      }
    });
  };

  return <div className="space-y-4">
    <div
      className={`rounded-xl border-2 border-dashed p-6 text-center transition ${dragging ? "border-sky-500 bg-sky-50" : "border-slate-300 bg-slate-50"}`}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => { event.preventDefault(); setDragging(false); }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        uploadFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <p className="font-medium text-slate-900">Drop source files or downloaded model packages here</p>
      <p className="mt-1 text-sm text-slate-500">Original files are preserved unchanged. Multiple files are supported.</p>
      <input ref={inputRef} className="sr-only" id="productSourceFiles" type="file" multiple onChange={(event) => uploadFiles(Array.from(event.target.files ?? []))} />
      <Button className="mt-3" type="button" variant="secondary" disabled={isPending} onClick={() => inputRef.current?.click()}>
        {isPending ? "Uploading…" : "Choose Files"}
      </Button>
    </div>
    {status ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{status}</p> : null}
    {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

    {sourceFiles.length === 0 ? <p className="text-sm text-slate-500">No source files uploaded yet.</p> : <div className="space-y-3">
      {sourceFiles.map((sourceFile) => {
        const candidates = sourceFile.packageManifest?.threeMfCandidates ?? [];
        return <div key={sourceFile.id} className="rounded-xl border border-slate-200 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="break-all font-medium text-slate-900">{sourceFile.originalName}</p>
              <p className="mt-1 text-xs text-slate-500">{formatBytes(sourceFile.sizeBytes)} · SHA-256 {sourceFile.sha256.slice(0, 12)}… · {new Date(sourceFile.createdAt).toLocaleString()}</p>
              {sourceFile.packageManifest?.kind === "ZIP" ? <p className="mt-1 text-xs text-slate-500">ZIP package · {sourceFile.packageManifest.entryCount ?? 0} entries</p> : null}
            </div>
            <div className="flex gap-2">
              <Link href={`/api/admin/products/${productId}/files/source/${sourceFile.id}/download`}><Button size="sm" type="button" variant="secondary">Download</Button></Link>
              <Button size="sm" type="button" variant="ghost" disabled={isPending} onClick={() => {
                if (!window.confirm(`Permanently delete ${sourceFile.originalName}?`)) return;
                setError(null);
                startTransition(async () => {
                  const response = await fetch(`/api/admin/products/${productId}/files/source/${sourceFile.id}`, { method: "DELETE" });
                  const payload = await readApiResponse(response);
                  if (!response.ok) setError(payload.error ?? "Unable to delete source file.");
                  else router.refresh();
                });
              }}>Delete</Button>
            </div>
          </div>
          {candidates.length === 0 ? <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">No 3MF file was found in this source.</p> : <div className="mt-3 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">3MF candidates</p>
            {candidates.map((candidate) => {
              const query = new URLSearchParams({ sourceFileId: sourceFile.id, ...(candidate.entryPath ? { entryPath: candidate.entryPath } : {}) });
              return <div key={candidate.entryPath ?? "direct"} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span className="break-all text-slate-700">{candidate.entryPath ?? candidate.fileName} · {formatBytes(candidate.sizeBytes)}</span>
                <Link href={`/admin/products/${productId}/files/process?${query}`}><Button size="sm" type="button" variant="secondary">Apply P2S Template &amp; Map Colors</Button></Link>
              </div>;
            })}
          </div>}
        </div>;
      })}
    </div>}
  </div>;
}
