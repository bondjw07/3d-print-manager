"use client";

import { useEffect, useState } from "react";
import { Select } from "@/components/ui/select";

type Tier = { id: string; category: string; label: string };

export function BulkPricingTierSelector({ tiers }: { tiers: Tier[] }) {
  const [tierId, setTierId] = useState("UNCHANGED");
  const selectedTier = tiers.find((tier) => tier.id === tierId);

  useEffect(() => {
    document.querySelectorAll<HTMLElement>("[data-bulk-product-row]").forEach((row) => {
      const qualifies = !selectedTier || row.dataset.bulkProductCategory === selectedTier.category;
      row.hidden = !qualifies;
      const checkbox = row.querySelector<HTMLInputElement>('input[name="productIds"]');
      if (checkbox) {
        checkbox.disabled = !qualifies;
        if (!qualifies) checkbox.checked = false;
        checkbox.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  }, [selectedTier]);

  return <div>
    <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500" htmlFor="bulkPricingTier">Pricing tier</label>
    <Select id="bulkPricingTier" name="pricingTierId" value={tierId} onChange={(event) => setTierId(event.target.value)}>
      <option value="UNCHANGED">Keep current tier</option>
      {tiers.map((tier) => <option key={tier.id} value={tier.id}>Set to {tier.label} ({tier.category})</option>)}
    </Select>
    <p className="mt-1 text-xs text-slate-500">Choosing a tier shows only eligible products.</p>
  </div>;
}
