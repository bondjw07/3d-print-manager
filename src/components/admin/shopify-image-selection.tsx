"use client";

import Image from "next/image";
import { useState } from "react";

type ProductImage = { id: string; imagePath: string; altText: string | null; isPrimary: boolean };

export function ShopifyImageSelection({ images }: { images: ProductImage[] }) {
  const [selected, setSelected] = useState(() => new Set(images.filter((image) => image.isPrimary).map((image) => image.id)));
  const [primaryId, setPrimaryId] = useState(images.find((image) => image.isPrimary)?.id ?? images[0]?.id ?? "");
  const [previewImage, setPreviewImage] = useState<ProductImage | null>(null);
  if (images.length === 0) return <p className="text-sm text-slate-500">This product has no images to include.</p>;

  return <fieldset className="space-y-2"><legend className="text-sm font-medium text-slate-700">Shopify images</legend><p className="text-xs text-slate-500">Choose the images to send. The primary image is sent first and becomes Shopify’s main product image.</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{images.map((image) => {
    const isSelected = selected.has(image.id);
    return <div key={image.id} className={`flex items-center gap-2 rounded-xl border p-2 ${isSelected ? "shopify-image-selected" : "border-slate-200"}`}>
      <input type="checkbox" name="imageIds" value={image.id} checked={isSelected} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(image.id); else next.delete(image.id); if (!event.target.checked && primaryId === image.id) setPrimaryId([...next][0] ?? ""); return next; })} />
      <button type="button" onClick={(event) => { event.preventDefault(); setPreviewImage(image); }} className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-100 ring-offset-2 focus:outline-none focus:ring-2 focus:ring-sky-400" aria-label="View full-size image"><Image src={image.imagePath} alt={image.altText ?? "Product image"} fill className="object-cover" sizes="48px" /></button>
      <span className="min-w-0 flex-1 text-xs text-slate-600">Include</span>
      <input type="radio" name="primaryImageId" value={image.id} checked={primaryId === image.id} disabled={!isSelected} onChange={() => setPrimaryId(image.id)} aria-label="Set as Shopify primary image" />
    </div>;
  })}</div>{previewImage ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4" role="dialog" aria-modal="true" aria-label="Full-size product image" onClick={() => setPreviewImage(null)}><div className="relative max-h-full max-w-5xl" onClick={(event) => event.stopPropagation()}><button type="button" onClick={() => setPreviewImage(null)} className="absolute right-2 top-2 z-10 rounded-lg bg-slate-950/70 px-3 py-2 text-sm font-medium text-white hover:bg-slate-950">Close</button><Image src={previewImage.imagePath} alt={previewImage.altText ?? "Product image"} width={1600} height={1200} className="max-h-[85vh] w-auto max-w-full rounded-xl object-contain" sizes="(max-width: 1024px) 100vw, 1024px" /></div></div> : null}</fieldset>;
}
