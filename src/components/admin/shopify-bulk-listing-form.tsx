"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { bulkCreateShopifyListingsAction } from "@/server/actions/portal-actions";
import { shopifyCategoryTagOptions } from "@/lib/domain";
import { ShopifyPublicationSelection } from "./shopify-publication-selection";

type Product = {
  id: string; publicName: string; sku: string; category: string; shortDescription: string; fullDescription: string; tags: string[];
  images: Array<{ id: string; imagePath: string; altText: string | null; isPrimary: boolean }>;
};
type Selection = { selected: boolean; price: string; categoryTag: string; imageIds: string[]; primaryImageId: string };

export function ShopifyBulkListingForm({ products, redirectTo }: { products: Product[]; redirectTo: string }) {
  const [selections, setSelections] = useState<Record<string, Selection>>(() => Object.fromEntries(products.map((product) => [product.id, {
    selected: false, price: "", categoryTag: "", imageIds: product.images.filter((image) => image.isPrimary).map((image) => image.id), primaryImageId: product.images.find((image) => image.isPrimary)?.id ?? product.images[0]?.id ?? "",
  }])));
  const [preview, setPreview] = useState<Product["images"][number] | null>(null);
  const selectedCount = useMemo(() => Object.values(selections).filter((selection) => selection.selected).length, [selections]);
  const items = useMemo(() => products.filter((product) => selections[product.id]?.selected).map((product) => ({ productId: product.id, price: selections[product.id].price, categoryTag: selections[product.id].categoryTag, imageIds: selections[product.id].imageIds, primaryImageId: selections[product.id].primaryImageId })), [products, selections]);
  const update = (productId: string, change: Partial<Selection>) => setSelections((current) => ({ ...current, [productId]: { ...current[productId], ...change } }));
  const toggleImage = (productId: string, imageId: string, checked: boolean) => {
    const current = selections[productId];
    const imageIds = checked ? [...new Set([...current.imageIds, imageId])] : current.imageIds.filter((id) => id !== imageId);
    update(productId, { imageIds, primaryImageId: checked ? current.primaryImageId || imageId : current.primaryImageId === imageId ? imageIds[0] ?? "" : current.primaryImageId });
  };

  return <form action={bulkCreateShopifyListingsAction} className="space-y-4">
    <input type="hidden" name="redirectTo" value={redirectTo} />
    <input type="hidden" name="items" value={JSON.stringify(items)} />
    <div className="sticky bottom-3 z-20 rounded-2xl border border-sky-200 bg-white/95 p-4 shadow-lg backdrop-blur dark:border-sky-900 dark:bg-slate-900/95">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-44"><p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{selectedCount} selected</p><p className="text-xs text-slate-500">Storefront: Shopify</p></div>
        <label className="grid gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">Shopify status<select name="shopifyProductStatus" defaultValue="DRAFT" className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"><option value="ACTIVE">Active</option><option value="DRAFT">Draft</option><option value="UNLISTED">Unlisted</option></select></label>
        <div className="min-w-64 flex-1"><ShopifyPublicationSelection /></div>
        <button type="submit" disabled={selectedCount === 0} className="h-10 rounded-xl bg-sky-500 px-5 text-sm font-semibold text-slate-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50">Create {selectedCount || ""} Shopify listing{selectedCount === 1 ? "" : "s"}</button>
      </div>
    </div>

    <div className="space-y-3">{products.map((product) => {
      const selection = selections[product.id];
      return <article key={product.id} className={`rounded-2xl border p-4 ${selection.selected ? "border-sky-400 bg-sky-50/40 dark:border-sky-700 dark:bg-sky-950/20" : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"}`}>
        <div className="flex gap-3">
          <input type="checkbox" checked={selection.selected} onChange={(event) => update(product.id, { selected: event.target.checked })} className="mt-1 h-4 w-4" aria-label={`Select ${product.publicName}`} />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold text-slate-900 dark:text-slate-100">{product.publicName}</h3><p className="text-xs text-slate-500">{product.sku} · {product.category}</p></div><label className="grid gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">Price<input type="number" min="0.01" step="0.01" value={selection.price} onChange={(event) => update(product.id, { price: event.target.value })} disabled={!selection.selected} placeholder="0.00" className="h-9 w-28 rounded-xl border border-slate-300 bg-white px-2 text-sm disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950" required={selection.selected} /></label></div>
            <div className="space-y-2"><p className="whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{product.fullDescription || product.shortDescription}</p><div className="flex flex-wrap gap-1.5">{product.tags.length ? product.tags.map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{tag}</span>) : <span className="text-xs text-slate-500">No product tags</span>}</div></div>
            <label className="grid max-w-xs gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">Category tag<select value={selection.categoryTag} onChange={(event) => update(product.id, { categoryTag: event.target.value })} disabled={!selection.selected} className="h-9 rounded-xl border border-slate-300 bg-white px-2 text-sm disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950"><option value="">No category tag</option>{shopifyCategoryTagOptions.map((option) => <option key={option.tag} value={option.tag}>{option.label}</option>)}</select></label>
            <fieldset><legend className="text-sm font-medium text-slate-700 dark:text-slate-200">Images</legend><p className="mb-2 text-xs text-slate-500">Choose included images; the selected primary image is sent first.</p><div className="flex flex-wrap gap-2">{product.images.map((image) => { const included = selection.imageIds.includes(image.id); return <div key={image.id} className={`flex items-center gap-2 rounded-xl border p-1.5 ${included ? "shopify-image-selected" : "border-slate-200 dark:border-slate-700"}`}><input type="checkbox" checked={included} onChange={(event) => toggleImage(product.id, image.id, event.target.checked)} disabled={!selection.selected} aria-label={`Include image for ${product.publicName}`} /><button type="button" onClick={() => setPreview(image)} className="relative h-12 w-12 overflow-hidden rounded-lg"><Image src={image.imagePath} alt={image.altText ?? product.publicName} fill className="object-cover" sizes="48px" /></button><input type="radio" name={`primary-${product.id}`} checked={selection.primaryImageId === image.id} disabled={!selection.selected || !included} onChange={() => update(product.id, { primaryImageId: image.id })} aria-label="Set as primary Shopify image" /></div>; })}{product.images.length === 0 ? <span className="text-xs text-slate-500">No product images</span> : null}</div></fieldset>
          </div>
        </div>
      </article>;
    })}</div>
    {preview ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4" role="dialog" aria-modal="true" onClick={() => setPreview(null)}><div className="relative max-h-full max-w-5xl" onClick={(event) => event.stopPropagation()}><button type="button" onClick={() => setPreview(null)} className="absolute right-2 top-2 z-10 rounded-lg bg-slate-950/70 px-3 py-2 text-sm font-medium text-white">Close</button><Image src={preview.imagePath} alt={preview.altText ?? "Product image"} width={1600} height={1200} className="max-h-[85vh] w-auto max-w-full rounded-xl object-contain" sizes="(max-width: 1024px) 100vw, 1024px" /></div></div> : null}
  </form>;
}
