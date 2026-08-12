"use client";

import { getShopifyPublicationsAction } from "@/server/actions/portal-actions";
import { useEffect, useState } from "react";

type Publication = { id: string; name: string };

export function ShopifyPublicationSelection() {
  const [publications, setPublications] = useState<Publication[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void getShopifyPublicationsAction().then(setPublications).catch((reason: unknown) => {
      const detail = reason instanceof Error ? reason.message : "Unknown error";
      setError(`Couldn't load Shopify publishing channels: ${detail}`);
    });
  }, []);
  return <fieldset className="grid gap-1 text-sm font-medium text-slate-700 md:col-span-2 xl:col-span-3"><legend>Publishing</legend><p className="text-xs font-normal text-slate-500">Select each Shopify sales channel where this product should be available.</p><div className="flex flex-wrap gap-2">{publications.map((publication) => <label key={publication.id} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-700"><input type="checkbox" name="shopifyPublicationIds" value={publication.id} />{publication.name}</label>)}</div>{error ? <span className="text-xs font-normal text-rose-600">{error}</span> : null}</fieldset>;
}
