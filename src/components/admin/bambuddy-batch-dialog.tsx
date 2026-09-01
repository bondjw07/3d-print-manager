"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { readApiResponse } from "@/lib/api-response";

type SelectedProduct = { id: string; publicName: string; printReadyName: string; tags: string[]; creatorName: string | null };
type PreviewRow = SelectedProduct & { categoryTag: string | null; valid: boolean };

export function BambuBuddyBatchDialog({ products, compact = false }: { products: SelectedProduct[]; compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const review = async () => {
    if (!products.length) return;
    setWorking(true); setError(null); setOpen(true);
    const response = await fetch("/api/admin/processing/bambuddy-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productIds: products.map((product) => product.id) }) });
    const payload = await readApiResponse(response) as { error?: string; rows?: PreviewRow[] };
    if (!response.ok) setError(payload.error ?? "Unable to load publish review."); else setRows(payload.rows ?? []);
    setWorking(false);
  };
  const publish = async () => {
    setWorking(true); setError(null);
    const response = await fetch("/api/admin/processing/bambuddy-publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productIds: rows.map((row) => row.id) }) });
    const payload = await readApiResponse(response);
    if (!response.ok) setError(payload.error ?? "Unable to queue publishing.");
    else { setOpen(false); router.refresh(); }
    setWorking(false);
  };
  return <>
    <Button size={compact ? "sm" : "md"} disabled={!products.length} onClick={() => void review()}>{compact ? "Publish" : `Review & Publish (${products.length})`}</Button>
    {open ? <div className="fixed inset-0 z-50 flex items-center justify-center p-4"><button type="button" aria-label="Close" className="absolute inset-0 bg-slate-900/45" onClick={() => !working && setOpen(false)} /><div role="dialog" aria-modal="true" className="relative max-h-[85vh] w-full max-w-4xl overflow-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
      <h2 className="text-lg font-semibold text-slate-900">Review BamBuddy Tags</h2><p className="mt-1 text-sm text-slate-600">Tags are read-only and come directly from each PMP Product. Edit the Product if they are incorrect.</p>
      {error ? <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      <div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="px-2 py-2">Product</th><th className="px-2 py-2">Print-Ready File</th><th className="px-2 py-2">PMP Tags Sent</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-slate-100 align-top"><td className="px-2 py-3"><p className="font-medium">{row.publicName}</p><p className="text-xs text-slate-500">{row.creatorName || "Creator missing"}</p><a href={`/admin/products/${row.id}`} className="text-xs text-sky-700 hover:underline">Edit Product</a></td><td className="px-2 py-3">{row.printReadyName ?? "Missing"}</td><td className="px-2 py-3"><div className="flex flex-wrap gap-1">{row.tags.map((tag) => <span key={tag} className={`rounded-full px-2 py-0.5 text-xs ${tag === row.categoryTag ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-700"}`}>{tag}</span>)}</div></td></tr>)}</tbody></table></div>
      <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" disabled={working} onClick={() => setOpen(false)}>Cancel</Button><Button disabled={working || !rows.length || rows.some((row) => !row.valid)} onClick={() => void publish()}>{working ? "Working…" : `Publish Selected to BamBuddy (${rows.length})`}</Button></div>
    </div></div> : null}
  </>;
}
