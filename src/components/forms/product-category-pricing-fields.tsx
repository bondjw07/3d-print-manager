"use client";

import { useState } from "react";
import { Select } from "@/components/ui/select";

type PricingTierOption = { id: string; category: string; label: string; suggestedPrice: string };

export function ProductCategoryPricingFields({
  categoryOptions,
  pricingTiers,
  initialCategory,
  initialPricingTierId,
}: {
  categoryOptions: string[];
  pricingTiers: PricingTierOption[];
  initialCategory: string;
  initialPricingTierId: string;
}) {
  const [category, setCategory] = useState(initialCategory);
  const availablePricingTiers = pricingTiers.filter((tier) => tier.category === category);
  const tierCategories = [...new Set(pricingTiers.map((tier) => tier.category))];

  return <>
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="category">Category</label>
      <Select id="category" name="category" required value={category} onChange={(event) => setCategory(event.target.value)} disabled={categoryOptions.length === 0}>
        <option value="">{categoryOptions.length ? "Select a category" : "Add categories in Settings first"}</option>
        {initialCategory && !categoryOptions.includes(initialCategory) ? <option value={initialCategory}>Current: {initialCategory} (not configured)</option> : null}
        {categoryOptions.map((option) => <option key={option} value={option}>{option}</option>)}
      </Select>
      <p className="mt-1 text-xs text-slate-500">Managed in Admin Settings.</p>
    </div>
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="pricingTierId">Pricing tier</label>
      <Select id="pricingTierId" name="pricingTierId" key={category} defaultValue={initialPricingTierId} disabled={!category || availablePricingTiers.length === 0}>
        <option value="">{availablePricingTiers.length ? "No pricing tier" : category ? `No tiers for ${category}` : "Select a category first"}</option>
        {availablePricingTiers.map((tier) => <option key={tier.id} value={tier.id}>{tier.label} — ${tier.suggestedPrice}</option>)}
      </Select>
      <p className="mt-1 text-xs text-slate-500">
        {category && availablePricingTiers.length === 0
          ? tierCategories.length
            ? `No pricing tiers are configured for ${category}. Existing tiers are for: ${tierCategories.join(", ")}.`
            : "No pricing tiers have been configured yet."
          : "Sets the suggested price when creating a listing."}
      </p>
    </div>
  </>;
}
