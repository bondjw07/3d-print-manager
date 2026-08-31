"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function BambuBuddyPublishButton({ productId, publishedIsCurrent, blockedReason }: { productId: string; publishedIsCurrent: boolean; blockedReason?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  return <div className="space-y-2">
    <Button disabled={isPending || Boolean(blockedReason)} onClick={() => {
      setError(null); setSuccess(null);
      startTransition(async () => {
        try {
          const response = await fetch(`/api/admin/products/${productId}/files/publish`, { method: "POST" });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error ?? "Publish failed.");
          setSuccess(publishedIsCurrent ? "BamBuddy tags and metadata re-synced." : `Published to BamBuddy as File ID ${payload.fileId}.`);
          router.refresh();
        } catch (publishError) {
          setError(publishError instanceof Error ? publishError.message : "Publish failed.");
          router.refresh();
        }
      });
    }}>{isPending ? "Working…" : publishedIsCurrent ? "Re-sync BamBuddy Tags & Metadata" : "Publish to BamBuddy"}</Button>
    {blockedReason ? <p className="text-xs text-amber-700">{blockedReason}</p> : null}
    {error ? <p className="text-xs text-rose-600">{error}</p> : null}
    {success ? <p className="text-xs text-emerald-600">{success}</p> : null}
  </div>;
}
