"use client";

import { useState } from "react";
import { ShopifyPublicationSelection } from "./shopify-publication-selection";

export function ShopifyPublishingControls({ className = "" }: { className?: string }) {
  const [status, setStatus] = useState("DRAFT");
  return <div className={`grid gap-3 ${className}`}><label className="grid gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">Shopify status<select name="shopifyProductStatus" value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"><option value="ACTIVE">Active</option><option value="DRAFT">Draft</option><option value="UNLISTED">Unlisted</option></select><span className="text-xs font-normal text-slate-500">Controls whether Shopify can make the product available. Unlisted products require a direct link.</span></label><ShopifyPublicationSelection disabled={status === "DRAFT"} /></div>;
}
