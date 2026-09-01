"use client";

import Image from "next/image";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Table, TableContainer } from "@/components/ui/table";
import type { ProcessingState } from "@/lib/product-processing";
import type { ProcessingQueueRow } from "@/server/services/processing-queue-service";
import { readApiResponse } from "@/lib/api-response";
import { PrintReadyBatchDialog } from "./print-ready-batch-dialog";
import { BambuBuddyBatchDialog } from "./bambuddy-batch-dialog";

type UploadProgress = { state: "queued" | "uploading" | "complete" | "failed"; loaded: number; total: number; error?: string };
type QueueRow = Omit<ProcessingQueueRow, "latestJobId"> & { latestJobId: string | null };

const stateTone = {
  neutral: "border-slate-200 bg-slate-100 text-slate-700",
  info: "border-sky-200 bg-sky-100 text-sky-800",
  warning: "border-amber-200 bg-amber-100 text-amber-800",
  danger: "border-rose-200 bg-rose-100 text-rose-800",
  success: "border-emerald-200 bg-emerald-100 text-emerald-800",
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
}

function SourceDropzone({ file, disabled, onFile, onRemove }: { file?: File; disabled: boolean; onFile: (file: File) => void; onRemove: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  if (file) return <div className="min-w-56 rounded-lg border border-sky-200 bg-sky-50 p-2 text-xs">
    <p className="max-w-64 truncate font-medium text-sky-900" title={file.name}>{file.name}</p>
    <p className="mt-0.5 text-sky-700">{formatBytes(file.size)}</p>
    <div className="mt-1 flex gap-2"><button type="button" disabled={disabled} className="font-medium text-sky-700 hover:underline disabled:opacity-50" onClick={() => inputRef.current?.click()}>Change</button><button type="button" disabled={disabled} className="text-rose-700 hover:underline disabled:opacity-50" onClick={onRemove}>Remove</button></div>
    <input ref={inputRef} className="sr-only" type="file" disabled={disabled} accept=".zip,.3mf" onChange={(event) => { const next = event.target.files?.[0]; if (next) onFile(next); }} />
  </div>;
  return <div
    role="button" tabIndex={0}
    className={`min-w-56 cursor-pointer rounded-lg border-2 border-dashed px-3 py-2 text-center text-xs ${dragging ? "border-sky-500 bg-sky-50 text-sky-800" : "border-slate-300 bg-slate-50 text-slate-600"}`}
    onClick={() => inputRef.current?.click()}
    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") inputRef.current?.click(); }}
    onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
    onDragOver={(event) => event.preventDefault()}
    onDragLeave={(event) => { event.preventDefault(); setDragging(false); }}
    onDrop={(event) => { event.preventDefault(); setDragging(false); const next = event.dataTransfer.files[0]; if (next) onFile(next); }}
  >
    Drop archive here or click to choose
    <input ref={inputRef} className="sr-only" type="file" accept=".zip,.3mf" onChange={(event) => { const next = event.target.files?.[0]; if (next) onFile(next); }} />
  </div>;
}

function uploadSource(productId: string, file: File, onProgress: (loaded: number, total: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `/api/admin/products/${encodeURIComponent(productId)}/files/source?queue=true&fileName=${encodeURIComponent(file.name)}`);
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

export function ProcessingQueueWorkbench({ initialRows, stateCounts }: { initialRows: QueueRow[]; stateCounts: Record<string, number> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<QueueRow[]>(initialRows);
  const [staged, setStaged] = useState<Map<string, File>>(() => new Map());
  const [uploads, setUploads] = useState<Map<string, UploadProgress>>(() => new Map());
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchTotalBytes, setBatchTotalBytes] = useState(0);
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setRows(initialRows); setSelected(new Set()); }, [initialRows]);

  useEffect(() => {
    if (!rows.length) return;
    let cancelled = false;
    const poll = async () => {
      if (document.visibilityState === "hidden") return;
      const query = new URLSearchParams(rows.map((row) => ["id", row.id]));
      const response = await fetch(`/api/admin/processing/status?${query}`, { cache: "no-store" });
      if (!response.ok || cancelled) return;
      const payload = await response.json() as { statuses: Array<{ id: string; state: ProcessingState; latestJobId: string | null }> };
      const refresh = payload.statuses.some((status) => {
        const row = rows.find((item) => item.id === status.id);
        return row && (status.latestJobId !== row.latestJobId || status.state.key !== row.state.key);
      });
      setRows((current) => current.map((row) => {
        const status = payload.statuses.find((item) => item.id === row.id);
        if (!status) return row;
        return { ...row, state: status.state, latestJobId: status.latestJobId };
      }));
      if (refresh) router.refresh();
    };
    const interval = window.setInterval(() => void poll(), rows.some((row) => row.state.key === "PROCESSING" || row.state.key === "PROCESSING_SOURCE") ? 2500 : 8000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [rows, router]);

  const uploadedBytes = Array.from(uploads.values()).reduce((total, upload) => total + Math.min(upload.loaded, upload.total), 0);
  const completedUploads = Array.from(uploads.values()).filter((upload) => upload.state === "complete").length;
  const failedUploads = Array.from(uploads.values()).filter((upload) => upload.state === "failed").length;
  const selectedRows = rows.filter((row) => selected.has(row.id));
  const selectedProcessed = selectedRows.filter((row) => row.state.key === "PROCESSED_READY" || row.state.key === "NEEDS_UPDATED_PRINT_READY");
  const selectedPublish = selectedRows.filter((row) => row.state.key === "READY_TO_PUBLISH");
  const selectableRows = rows.filter((row) => row.state.key === "PROCESSED_READY" || row.state.key === "NEEDS_UPDATED_PRINT_READY" || row.state.key === "READY_TO_PUBLISH");
  const selectedSelectableCount = selectableRows.filter((row) => selected.has(row.id)).length;
  const allSelectableSelected = selectableRows.length > 0 && selectedSelectableCount === selectableRows.length;

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = selectedSelectableCount > 0 && !allSelectableSelected;
  }, [allSelectableSelected, selectedSelectableCount]);

  const stateHref = (state: string) => {
    const query = new URLSearchParams(searchParams.toString());
    query.set("state", state); query.delete("page");
    return `/admin/products/processing?${query}`;
  };

  const beginUploads = async () => {
    const entries = Array.from(staged.entries());
    if (!entries.length) return;
    setBatchRunning(true);
    setBatchTotalBytes(entries.reduce((total, [, file]) => total + file.size, 0));
    setUploads(new Map(entries.map(([id, file]) => [id, { state: "queued", loaded: 0, total: file.size }])));
    let cursor = 0;
    const lane = async () => {
      while (cursor < entries.length) {
        const [productId, file] = entries[cursor++];
        setUploads((current) => new Map(current).set(productId, { state: "uploading", loaded: 0, total: file.size }));
        try {
          await uploadSource(productId, file, (loaded, total) => setUploads((current) => new Map(current).set(productId, { state: "uploading", loaded, total })));
          setUploads((current) => new Map(current).set(productId, { state: "complete", loaded: file.size, total: file.size }));
          setStaged((current) => { const next = new Map(current); next.delete(productId); return next; });
        } catch (error) {
          setUploads((current) => new Map(current).set(productId, { state: "failed", loaded: 0, total: file.size, error: error instanceof Error ? error.message : "Upload failed." }));
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, entries.length) }, () => lane()));
    setBatchRunning(false);
    router.refresh();
  };

  const retry = async (jobId: string | null) => {
    if (!jobId) return;
    const response = await fetch(`/api/admin/processing/jobs/${jobId}/retry`, { method: "POST" });
    if (!response.ok) window.alert((await readApiResponse(response)).error ?? "Unable to retry the job.");
    router.refresh();
  };

  const quickStates = [
    ["NEEDS_SOURCE", "Needs Source"], ["PROCESSING_SOURCE", "Processing"], ["NEEDS_MAPPING_REVIEW", "Mapping Review"],
    ["NEEDS_PRINT_READY", "Needs Print-Ready"], ["READY_TO_PUBLISH", "Ready to Publish"], ["ATTENTION", "Attention"], ["ERROR", "Errors"],
  ];

  return <div className="space-y-3">
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
      {quickStates.map(([key, label]) => <Link key={key} href={stateHref(key)} className="rounded-xl border border-slate-200 bg-slate-50 p-3 hover:border-sky-300 hover:bg-sky-50">
        <p className="text-xl font-semibold text-slate-900">{stateCounts[key] ?? 0}</p><p className="text-xs text-slate-600">{label}</p>
      </Link>)}
    </div>

    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <Button disabled={!staged.size || batchRunning} onClick={() => void beginUploads()}>{batchRunning ? "Uploading…" : `Upload Selected Files${staged.size ? ` (${staged.size})` : ""}`}</Button>
      <form action="/api/admin/processing/processed-download" method="post">
        {selectedProcessed.map((row) => <input key={row.id} type="hidden" name="productIds" value={row.id} />)}
        <Button type="submit" variant="secondary" disabled={!selectedProcessed.length}>Download Ready 3MFs ({selectedProcessed.length})</Button>
      </form>
      <PrintReadyBatchDialog />
      <BambuBuddyBatchDialog products={selectedPublish.map((row) => ({ id: row.id, publicName: row.publicName, printReadyName: row.printReady?.downloadName ?? "", tags: row.tags, creatorName: row.creatorName }))} />
      {uploads.size ? <div className="min-w-56 flex-1 text-xs text-slate-600">
        <div className="mb-1 flex justify-between"><span>{completedUploads} of {uploads.size} uploads completed{failedUploads ? ` · ${failedUploads} failed` : ""}</span><span>{batchTotalBytes ? Math.round((uploadedBytes / batchTotalBytes) * 100) : 100}%</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-sky-500 transition-all" style={{ width: `${batchTotalBytes ? (uploadedBytes / batchTotalBytes) * 100 : 100}%` }} /></div>
      </div> : null}
    </div>

    <TableContainer className="rounded-xl border border-slate-200">
      <Table>
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="w-10 px-3 py-2"><input ref={selectAllRef} type="checkbox" disabled={!selectableRows.length} checked={allSelectableSelected} aria-label="Select all eligible Products on this page" onChange={(event) => setSelected((current) => { const next = new Set(current); for (const row of selectableRows) { if (event.target.checked) next.add(row.id); else next.delete(row.id); } return next; })} /></th><th className="px-3 py-2">Thumb</th><th className="px-3 py-2">Product</th><th className="px-3 py-2">Processing State</th><th className="px-3 py-2">Details</th><th className="px-3 py-2">Next Action</th></tr></thead>
        <tbody>{rows.map((row) => {
          const upload = uploads.get(row.id);
          const reviewQuery = row.reviewCandidate ? new URLSearchParams({ sourceFileId: row.reviewCandidate.sourceFileId, ...(row.reviewCandidate.entryPath ? { entryPath: row.reviewCandidate.entryPath } : {}), queue: "1" }) : null;
          const selectable = row.state.key === "PROCESSED_READY" || row.state.key === "NEEDS_UPDATED_PRINT_READY" || row.state.key === "READY_TO_PUBLISH";
          return <tr key={row.id} className="border-t border-slate-100 align-top hover:bg-slate-50/70">
            <td className="px-3 py-3"><input type="checkbox" disabled={!selectable} checked={selected.has(row.id)} aria-label={`Select ${row.publicName}`} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(row.id); else next.delete(row.id); return next; })} /></td>
            <td className="px-3 py-3"><Link href={`/admin/products/${row.id}`} className="block">{row.image ? <div className="relative h-14 w-14 overflow-hidden rounded-lg border border-slate-200 bg-slate-100"><Image src={row.image.imagePath} alt={row.image.altText ?? row.publicName} fill className="object-cover" sizes="56px" /></div> : <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-center text-[10px] text-slate-500">No Image</div>}</Link></td>
            <td className="px-3 py-3"><Link href={`/admin/products/${row.id}`} className="font-medium text-slate-900 hover:underline">{row.publicName}</Link><p className="mt-1 flex items-center gap-1 text-xs text-slate-500">{row.creatorProductUrl ? <a href={row.creatorProductUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap hover:text-sky-700 hover:underline" aria-label={`Open creator product page for ${row.publicName} in a new tab`}>{row.sku}<ExternalLink className="h-3 w-3" aria-hidden /></a> : <span className="whitespace-nowrap">{row.sku}</span>}<span>· {row.category}</span></p><div className="mt-1 flex max-w-sm flex-wrap gap-1">{row.tags.slice(0, 5).map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{tag}</span>)}</div></td>
            <td className="px-3 py-3"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${stateTone[row.state.tone]}`}>{row.state.step ? `${row.state.step} · ` : row.state.key === "ERROR" ? "Error · " : row.state.key === "ATTENTION" ? "Attention · " : ""}{row.state.label}</span></td>
            <td className="max-w-md px-3 py-3 text-xs text-slate-600">{upload && upload.state !== "complete" ? <div><p className={upload.state === "failed" ? "text-rose-700" : "text-sky-700"}>{upload.state === "uploading" ? `Uploading ${Math.round((upload.loaded / Math.max(1, upload.total)) * 100)}%` : upload.state === "failed" ? upload.error : "Waiting to upload"}</p>{upload.state === "uploading" ? <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-sky-500" style={{ width: `${(upload.loaded / Math.max(1, upload.total)) * 100}%` }} /></div> : null}</div> : row.state.details}</td>
            <td className="px-3 py-3">{row.state.action === "UPLOAD_SOURCE" ? <SourceDropzone file={staged.get(row.id)} disabled={batchRunning} onFile={(file) => setStaged((current) => new Map(current).set(row.id, file))} onRemove={() => setStaged((current) => { const next = new Map(current); next.delete(row.id); return next; })} /> : row.state.action === "REVIEW_MAPPING" ? reviewQuery ? <Link href={`/admin/products/${row.id}/files/process?${reviewQuery}`}><Button size="sm">Review Mapping</Button></Link> : <Button size="sm" disabled>Preparing Review…</Button> : row.state.action === "DOWNLOAD_PROCESSED" ? <div className="flex flex-wrap gap-2"><Link prefetch={false} href={`/api/admin/products/${row.id}/files/artifact/processed/download`}><Button size="sm">Download 3MF</Button></Link><PrintReadyBatchDialog productId={row.id} /></div> : row.state.action === "UPLOAD_PRINT_READY" ? <PrintReadyBatchDialog productId={row.id} /> : row.state.action === "PUBLISH" ? <BambuBuddyBatchDialog products={[{ id: row.id, publicName: row.publicName, printReadyName: row.printReady?.downloadName ?? "", tags: row.tags, creatorName: row.creatorName }]} compact /> : row.state.action === "RETRY" ? <Button size="sm" variant="secondary" onClick={() => void retry(row.latestJobId)}>Retry</Button> : <Link href={`/admin/products/${row.id}/files`}><Button size="sm" variant="secondary">{row.state.action === "RESOLVE" ? "Resolve" : "View Files"}</Button></Link>}</td>
          </tr>;
        })}</tbody>
      </Table>
    </TableContainer>
    {!rows.length ? <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No Products match these queue filters.</p> : null}
  </div>;
}
