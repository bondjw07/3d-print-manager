"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { readApiResponse } from "@/lib/api-response";

type Match = { index: number; name: string; size: number; status: string; productId: string | null; productName: string | null; expectedName: string | null; hasExisting: boolean };
type UploadState = { loaded: number; total: number; status: "uploading" | "complete" | "failed"; error?: string };

function upload(productId: string, file: File, onProgress: (loaded: number, total: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `/api/admin/products/${encodeURIComponent(productId)}/files/print-ready?fileName=${encodeURIComponent(file.name)}`);
    request.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    request.upload.onprogress = (event) => onProgress(event.loaded, event.lengthComputable ? event.total : file.size);
    request.onerror = () => reject(new Error("The upload connection failed."));
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else {
        try { reject(new Error((JSON.parse(request.responseText) as { error?: string }).error || "Upload failed.")); }
        catch { reject(new Error("Upload failed.")); }
      }
    };
    request.send(file);
  });
}

export function PrintReadyBatchDialog({ productId }: { productId?: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [allowReplace, setAllowReplace] = useState(false);
  const [uploads, setUploads] = useState<Map<number, UploadState>>(new Map());
  const [working, setWorking] = useState(false);

  const choose = () => inputRef.current?.click();
  const preview = async (selected: File[]) => {
    setFiles(selected); setError(null); setMatches([]); setUploads(new Map());
    if (!selected.length) return;
    const response = await fetch("/api/admin/processing/print-ready-match", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, files: selected.map((file) => ({ name: file.name, size: file.size })) }) });
    const payload = await readApiResponse(response) as { error?: string; matches?: Match[] };
    if (!response.ok) setError(payload.error ?? "Unable to match files.");
    else setMatches(payload.matches ?? []);
  };
  const eligible = matches.filter((match) => match.status === "MATCHED" && match.productId && (!match.hasExisting || allowReplace));
  const pendingEligible = eligible.filter((match) => uploads.get(match.index)?.status !== "complete");
  const reset = () => {
    setFiles([]);
    setMatches([]);
    setUploads(new Map());
    setAllowReplace(false);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };
  const confirm = async () => {
    setWorking(true); setError(null);
    let cursor = 0;
    let failedCount = 0;
    const lane = async () => {
      while (cursor < pendingEligible.length) {
        const match = pendingEligible[cursor++];
        const file = files[match.index];
        setUploads((current) => new Map(current).set(match.index, { loaded: 0, total: file.size, status: "uploading" }));
        try {
          await upload(match.productId!, file, (loaded, total) => setUploads((current) => new Map(current).set(match.index, { loaded, total, status: "uploading" })));
          setUploads((current) => new Map(current).set(match.index, { loaded: file.size, total: file.size, status: "complete" }));
        } catch (uploadError) {
          failedCount += 1;
          setUploads((current) => new Map(current).set(match.index, { loaded: 0, total: file.size, status: "failed", error: uploadError instanceof Error ? uploadError.message : "Upload failed." }));
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, pendingEligible.length) }, () => lane()));
    setWorking(false);
    if (failedCount === 0) {
      setOpen(false);
      reset();
    } else {
      setError(`${failedCount} upload${failedCount === 1 ? "" : "s"} failed. Completed files will not be uploaded again.`);
    }
    router.refresh();
  };
  return <>
    <Button size={productId ? "sm" : "md"} variant="secondary" onClick={() => { setOpen(true); setTimeout(choose, 0); }}>{productId ? "Upload Print-Ready" : "Upload Print-Ready Files"}</Button>
    <input ref={inputRef} className="sr-only" type="file" multiple={!productId} accept=".gcode.3mf" onChange={(event) => void preview(Array.from(event.target.files ?? []))} />
    {open ? <div className="fixed inset-0 z-50 flex items-center justify-center p-4"><button type="button" aria-label="Close" className="absolute inset-0 bg-slate-900/45" onClick={() => !working && setOpen(false)} /><div role="dialog" aria-modal="true" className="relative max-h-[85vh] w-full max-w-4xl overflow-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
      <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-slate-900">Review Print-Ready Matches</h2><p className="mt-1 text-sm text-slate-600">Files are matched only by the exact processed filename relationship.</p></div><Button variant="ghost" onClick={() => setOpen(false)} disabled={working}>Close</Button></div>
      <div className="mt-4 flex gap-2"><Button variant="secondary" onClick={choose} disabled={working}>{files.length ? "Change Files" : "Choose Files"}</Button><span className="self-center text-sm text-slate-500">{files.length} selected</span></div>
      {error ? <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {matches.length ? <div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="px-2 py-2">Uploaded File</th><th className="px-2 py-2">Matched Product</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Progress</th></tr></thead><tbody>{matches.map((match) => { const progress = uploads.get(match.index); return <tr key={`${match.index}-${match.name}`} className="border-t border-slate-100"><td className="px-2 py-3">{match.name}</td><td className="px-2 py-3">{match.productName ?? "—"}{match.expectedName ? <p className="text-xs text-slate-500">Expected: {match.expectedName}</p> : null}</td><td className="px-2 py-3"><span className={match.status === "MATCHED" ? "text-emerald-700" : "text-amber-700"}>{match.status.replaceAll("_", " ")}</span>{match.hasExisting ? <p className="text-xs text-amber-700">Will replace existing file</p> : null}</td><td className="px-2 py-3 text-xs">{progress?.status === "uploading" ? `${Math.round(progress.loaded / Math.max(1, progress.total) * 100)}%` : progress?.status === "failed" ? <span className="text-rose-700">{progress.error}</span> : progress?.status ?? "—"}</td></tr>; })}</tbody></table></div> : null}
      {matches.some((match) => match.hasExisting && match.status === "MATCHED") ? <label className="mt-4 flex items-center gap-2 text-sm text-amber-800"><input type="checkbox" checked={allowReplace} onChange={(event) => setAllowReplace(event.target.checked)} />Replace existing print-ready files shown above</label> : null}
      <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)} disabled={working}>Cancel</Button>{matches.length ? <Button disabled={working || !pendingEligible.length || matches.some((match) => match.status !== "MATCHED")} onClick={() => void confirm()}>{working ? "Uploading…" : uploads.size ? `Retry Failed ${pendingEligible.length}` : `Approve & Upload ${pendingEligible.length}`}</Button> : <Button onClick={choose}>Choose Files</Button>}</div>
    </div></div> : null}
  </>;
}
