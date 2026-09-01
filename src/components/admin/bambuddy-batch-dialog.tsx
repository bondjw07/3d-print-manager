"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { readApiResponse } from "@/lib/api-response";

type SelectedProduct = { id: string; publicName: string; printReadyName: string; tags: string[]; creatorName: string | null };
type PreviewRow = SelectedProduct & { categoryTag: string | null; valid: boolean };
type PublishState = "pending" | "queueing" | "queued" | "publishing" | "complete" | "failed";
type PublishProgress = { state: PublishState; phase: string; jobId?: string; error?: string };
type PublishJob = {
  id: string;
  productId: string;
  kind: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  phase: string | null;
  progress: number | null;
  error: string | null;
};

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function progressTone(state: PublishState) {
  if (state === "complete") return "text-emerald-700";
  if (state === "failed") return "text-rose-700";
  if (state === "pending") return "text-slate-500";
  return "text-sky-700";
}

export function BambuBuddyBatchDialog({
  products,
  compact = false,
  onPublishingChange,
}: {
  products: SelectedProduct[];
  compact?: boolean;
  onPublishingChange?: (publishing: boolean) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [publishes, setPublishes] = useState<Map<string, PublishProgress>>(() => new Map());
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const updateProgress = (productId: string, progress: PublishProgress) => {
    setPublishes((current) => new Map(current).set(productId, progress));
  };

  const review = async () => {
    if (!products.length) return;
    setWorking(true);
    setError(null);
    setRows([]);
    setPublishes(new Map());
    setOpen(true);
    try {
      const response = await fetch("/api/admin/processing/bambuddy-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: products.map((product) => product.id) }),
      });
      const payload = await readApiResponse(response) as { error?: string; rows?: PreviewRow[] };
      if (!response.ok) throw new Error(payload.error ?? "Unable to load publish review.");
      const previewRows = payload.rows ?? [];
      setRows(previewRows);
      setPublishes(new Map(previewRows.map((row) => [row.id, { state: "pending", phase: "Waiting to publish" }])));
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Unable to load publish review.");
    } finally {
      setWorking(false);
    }
  };

  const followJob = async (productId: string, jobId: string) => {
    while (true) {
      const response = await fetch(`/api/admin/processing/jobs/${encodeURIComponent(jobId)}`, { cache: "no-store" });
      const payload = await readApiResponse(response) as { error?: string; job?: PublishJob };
      if (!response.ok || !payload.job) throw new Error(payload.error ?? "Unable to read BamBuddy publish progress.");
      const job = payload.job;
      if (job.productId !== productId || job.kind !== "BAMBUDDY_PUBLISH") throw new Error("The publish job did not match this Product.");
      if (job.status === "FAILED") throw new Error(job.error?.trim() || "BamBuddy publishing failed.");
      if (job.status === "SUCCEEDED") return;
      updateProgress(productId, {
        state: job.status === "RUNNING" ? "publishing" : "queued",
        phase: job.status === "QUEUED" ? `Queued · ${job.phase || "Waiting for file worker"}` : job.phase || "Publishing to BamBuddy",
        jobId,
      });
      await wait(750);
    }
  };

  const publish = async () => {
    const pendingRows = rows.filter((row) => row.valid && publishes.get(row.id)?.state !== "complete");
    if (!pendingRows.length) return;
    setWorking(true);
    onPublishingChange?.(true);
    setError(null);
    let failedCount = 0;

    try {
      for (const row of pendingRows) {
        updateProgress(row.id, { state: "queueing", phase: "Starting publish" });
        try {
          const response = await fetch("/api/admin/processing/bambuddy-publish", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productId: row.id }),
          });
          const payload = await readApiResponse(response) as { error?: string; jobId?: string };
          if (!response.ok || !payload.jobId) throw new Error(payload.error ?? "Unable to queue publishing.");
          updateProgress(row.id, { state: "queued", phase: "Queued for BamBuddy publishing", jobId: payload.jobId });
          await followJob(row.id, payload.jobId);
          updateProgress(row.id, { state: "complete", phase: "Published to BamBuddy", jobId: payload.jobId });
        } catch (publishError) {
          failedCount += 1;
          updateProgress(row.id, {
            state: "failed",
            phase: "Publish failed",
            error: publishError instanceof Error ? publishError.message : "BamBuddy publishing failed.",
          });
        }
      }
    } finally {
      setWorking(false);
      onPublishingChange?.(false);
    }

    router.refresh();
    if (failedCount === 0) {
      setOpen(false);
      setRows([]);
      setPublishes(new Map());
    } else {
      setError(`${failedCount} publish${failedCount === 1 ? "" : "es"} failed. Completed Products will not be published again.`);
    }
  };

  const completedCount = rows.filter((row) => publishes.get(row.id)?.state === "complete").length;
  const failedCount = rows.filter((row) => publishes.get(row.id)?.state === "failed").length;
  const terminalCount = completedCount + failedCount;
  const pendingCount = rows.filter((row) => row.valid && publishes.get(row.id)?.state !== "complete").length;
  const allValid = rows.length > 0 && rows.every((row) => row.valid);

  return <>
    <Button size={compact ? "sm" : "md"} disabled={!products.length} onClick={() => void review()}>{compact ? "Publish" : `Review & Publish (${products.length})`}</Button>
    {open ? <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-slate-900/45" onClick={() => !working && setOpen(false)} />
      <div role="dialog" aria-modal="true" className="relative max-h-[85vh] w-full max-w-5xl overflow-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div><h2 className="text-lg font-semibold text-slate-900">Review BamBuddy Publishing</h2><p className="mt-1 text-sm text-slate-600">Products publish individually. Tags are read-only and come directly from each PMP Product.</p></div>
          <Button variant="ghost" disabled={working} onClick={() => setOpen(false)}>Close</Button>
        </div>
        {error ? <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        {rows.length && publishes.size ? <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
          <div className="mb-1 flex justify-between gap-3"><span>{completedCount} of {rows.length} published{failedCount ? ` · ${failedCount} failed` : ""}</span><span>{Math.round((terminalCount / rows.length) * 100)}%</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-sky-500 transition-all" style={{ width: `${(terminalCount / rows.length) * 100}%` }} /></div>
        </div> : null}
        <div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="px-2 py-2">Product</th><th className="px-2 py-2">Print-Ready File</th><th className="px-2 py-2">PMP Tags Sent</th><th className="px-2 py-2">Progress</th></tr></thead><tbody>{rows.map((row) => {
          const progress = publishes.get(row.id) ?? { state: "pending" as const, phase: "Waiting to publish" };
          return <tr key={row.id} className="border-t border-slate-100 align-top">
            <td className="px-2 py-3"><p className="font-medium">{row.publicName}</p><p className="text-xs text-slate-500">{row.creatorName || "Creator missing"}</p><a href={`/admin/products/${row.id}`} className="text-xs text-sky-700 hover:underline">Edit Product</a></td>
            <td className="px-2 py-3">{row.printReadyName ?? "Missing"}</td>
            <td className="px-2 py-3"><div className="flex flex-wrap gap-1">{row.tags.map((tag) => <span key={tag} className={`rounded-full px-2 py-0.5 text-xs ${tag === row.categoryTag ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-700"}`}>{tag}</span>)}</div></td>
            <td className={`min-w-52 px-2 py-3 text-xs ${progressTone(progress.state)}`}><p>{progress.state === "complete" ? "Complete" : progress.state === "failed" ? "Failed" : progress.phase}</p>{progress.error ? <p className="mt-1 max-w-sm">{progress.error}</p> : null}{progress.state === "queueing" || progress.state === "queued" || progress.state === "publishing" ? <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sky-100"><div className="h-full w-1/2 animate-pulse rounded-full bg-sky-500" /></div> : null}</td>
          </tr>;
        })}</tbody></table></div>
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" disabled={working} onClick={() => setOpen(false)}>{working ? "Publishing…" : "Cancel"}</Button><Button disabled={working || !allValid || !pendingCount} onClick={() => void publish()}>{working ? `Publishing ${Math.min(completedCount + failedCount + 1, rows.length)} of ${rows.length}…` : failedCount ? `Retry Failed (${pendingCount})` : `Publish to BamBuddy (${pendingCount})`}</Button></div>
      </div>
    </div> : null}
  </>;
}
