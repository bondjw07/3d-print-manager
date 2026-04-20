"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ImageUploadForm({ productId }: { productId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        setSuccess(null);

        const formElement = event.currentTarget;
        const fileInput = formElement.elements.namedItem("file") as HTMLInputElement | null;

        if (!fileInput?.files?.[0]) {
          setError("Choose an image to upload.");
          return;
        }

        const formData = new FormData(formElement);
        formData.set("productId", productId);

        startTransition(async () => {
          try {
            const response = await fetch("/api/upload/product-image", {
              method: "POST",
              body: formData,
            });

            const payload = await response.json();
            if (!response.ok) {
              throw new Error(payload.error ?? "Upload failed");
            }

            formElement.reset();
            setSuccess("Image uploaded.");
            router.refresh();
          } catch (uploadError) {
            const message = uploadError instanceof Error ? uploadError.message : "Upload failed.";
            setError(message);
          }
        });
      }}
    >
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-700" htmlFor="file">
          Image file
        </label>
        <Input id="file" name="file" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" required />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-700" htmlFor="altText">
          Alt text
        </label>
        <Input id="altText" name="altText" placeholder="Optional accessible text" />
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Uploading..." : "Upload"}
      </Button>
      {error ? <p className="text-xs text-rose-600 sm:col-span-3">{error}</p> : null}
      {success ? <p className="text-xs text-emerald-600 sm:col-span-3">{success}</p> : null}
    </form>
  );
}
