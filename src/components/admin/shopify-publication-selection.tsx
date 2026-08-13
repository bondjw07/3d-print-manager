"use client";

import { getShopifyPublicationsAction } from "@/server/actions/portal-actions";
import { useEffect, useState } from "react";

type Publication = { id: string; name: string };

export function ShopifyPublicationSelection({ disabled = false }: { disabled?: boolean }) {
  const [publications, setPublications] = useState<Publication[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void getShopifyPublicationsAction().then(setPublications).catch((reason: unknown) => {
      const detail = reason instanceof Error ? reason.message : "Unknown error";
      setError(`Couldn't load Shopify publishing channels: ${detail}`);
    });
  }, []);
  return <fieldset disabled={disabled} className="grid gap-1 text-sm font-medium text-slate-700 disabled:opacity-50 dark:text-slate-200"><legend>Publishing</legend><p className="text-xs font-normal text-slate-500">{disabled ? "Choose Active or Unlisted status before selecting sales channels." : "Select each Shopify sales channel where this product should be available."}</p><div className="flex flex-wrap gap-2">{publications.map((publication) => <label key={publication.id} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-700 dark:border-slate-700 dark:text-slate-200"><input type="checkbox" name="shopifyPublicationIds" value={publication.id} />{publication.name}</label>)}</div>{error ? <span className="text-xs font-normal text-rose-600">{error}</span> : null}</fieldset>;
}
