import type { Creator, PricingTier, Product } from "@/generated/prisma/client";
import {
  inventoryModeOptions,
  productStatusOptions,
  humanizeEnum,
} from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/utils";
import { ProductCategoryPricingFields } from "./product-category-pricing-fields";

function formatPrintDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.round((totalSeconds % 3_600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function ProductForm({
  product,
  creators,
  categoryOptions,
  pricingTiers,
  currentManagedCreatorId,
  action,
  bambuBuddyImportAction,
  redirectTo,
  submitLabel,
}: {
  product?: Product;
  creators: Creator[];
  categoryOptions: string[];
  pricingTiers: PricingTier[];
  currentManagedCreatorId?: string | null;
  action: (formData: FormData) => void | Promise<void>;
  bambuBuddyImportAction?: (formData: FormData) => void | Promise<void>;
  redirectTo: string;
  submitLabel: string;
}) {
  const hasUnmanagedCurrentCreator =
    Boolean(product?.importSourceCreatorName?.trim()) && !currentManagedCreatorId;
  const creatorSelectDefault = product
    ? currentManagedCreatorId ?? (hasUnmanagedCurrentCreator ? "__UNCHANGED__" : "")
    : "";

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {product ? <input type="hidden" name="productId" value={product.id} /> : null}
      <input type="hidden" name="redirectTo" value={redirectTo} />

      <section className="grid gap-4 rounded-xl border border-slate-200 bg-surface-muted p-4 sm:col-span-2 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <h2 className="font-semibold text-slate-900">Catalog details</h2>
          <p className="text-sm text-slate-500">Core information used to identify and describe this product.</p>
        </div>
      <div className="sm:col-span-2">
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="name">
          Name
        </label>
        <Input id="name" name="name" required defaultValue={product?.publicName ?? product?.internalName ?? ""} />
      </div>

      <div className="sm:col-span-2">
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="fullDescription">
          Full description
        </label>
        <Textarea id="fullDescription" name="fullDescription" required defaultValue={product?.fullDescription ?? ""} />
      </div>

      <ProductCategoryPricingFields
        categoryOptions={categoryOptions}
        pricingTiers={pricingTiers.map((tier) => ({ ...tier, suggestedPrice: tier.suggestedPrice.toString() }))}
        initialCategory={product?.category ?? ""}
        initialPricingTierId={product?.pricingTierId ?? ""}
      />
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="tags">
          Tags (comma-separated)
        </label>
        <Input id="tags" name="tags" defaultValue={product?.tags?.join(", ") ?? ""} />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="creatorId">
          Creator
        </label>
        <Select id="creatorId" name="creatorId" defaultValue={creatorSelectDefault}>
          <option value="">No creator</option>
          {hasUnmanagedCurrentCreator ? (
            <option value="__UNCHANGED__">{product?.importSourceCreatorName}</option>
          ) : null}
          {creators.map((creator) => (
            <option key={creator.id} value={creator.id}>
              {creator.name}
            </option>
          ))}
        </Select>
        <p className="mt-1 text-xs text-slate-500">Managed in Admin Settings.</p>
      </div>
      </section>

      <section className="grid gap-4 rounded-xl border border-slate-200 bg-surface-muted p-4 sm:col-span-2 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <h2 className="font-semibold text-slate-900">Availability</h2>
          <p className="text-sm text-slate-500">Control where the product can appear and how it can be requested.</p>
        </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="sku">
          SKU
        </label>
        <Input id="sku" name="sku" required defaultValue={product?.sku ?? ""} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="status">
          Product status
        </label>
        <Select id="status" name="status" defaultValue={product?.status ?? "ACTIVE"}>
          {productStatusOptions.map((status) => (
            <option key={status} value={status}>
              {humanizeEnum(status)}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="inventoryMode">
          Inventory mode
        </label>
        <Select id="inventoryMode" name="inventoryMode" defaultValue={product?.inventoryMode ?? "STOCKED"}>
          {inventoryModeOptions.map((mode) => (
            <option key={mode} value={mode}>
              {humanizeEnum(mode)}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="isPublic">
          Public visibility
        </label>
        <Select id="isPublic" name="isPublic" defaultValue={String(product?.isPublic ?? false)}>
          <option value="true">Public</option>
          <option value="false">Private</option>
        </Select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="isRequestable">
          Requestable
        </label>
        <Select id="isRequestable" name="isRequestable" defaultValue={String(product?.isRequestable ?? false)}>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </Select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="isListable">
          Listable
        </label>
        <Select id="isListable" name="isListable" defaultValue={String(product?.isListable ?? false)}>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </Select>
      </div>
      </section>

      <section className="grid gap-4 rounded-xl border border-slate-200 bg-surface-muted p-4 sm:col-span-2 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <h2 className="font-semibold text-slate-900">Print specifications</h2>
          <p className="text-sm text-slate-500">Physical measurements, packaging, and the linked BambuBuddy print file.</p>
        </div>
      <div className="grid grid-cols-3 gap-2 sm:col-span-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700" htmlFor="lengthMm">
            Length mm
          </label>
          <Input id="lengthMm" name="lengthMm" type="number" step="0.01" defaultValue={product?.lengthMm?.toString() ?? ""} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700" htmlFor="widthMm">
            Width mm
          </label>
          <Input id="widthMm" name="widthMm" type="number" step="0.01" defaultValue={product?.widthMm?.toString() ?? ""} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700" htmlFor="heightMm">
            Height mm
          </label>
          <Input id="heightMm" name="heightMm" type="number" step="0.01" defaultValue={product?.heightMm?.toString() ?? ""} />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="itemWeightGrams">
          Item weight (grams)
        </label>
        <Input
          id="itemWeightGrams"
          name="itemWeightGrams"
          type="number"
          step="0.01"
          defaultValue={product?.itemWeightGrams?.toString() ?? ""}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="packagingType">
          Packaging type
        </label>
        <Input id="packagingType" name="packagingType" defaultValue={product?.packagingType ?? ""} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="bambuBuddyFileId">
          BambuBuddy file ID
        </label>
        <div className="flex gap-2">
          <Input id="bambuBuddyFileId" name="bambuBuddyFileId" defaultValue={product?.bambuBuddyFileId ?? ""} />
          {product && bambuBuddyImportAction ? <Button type="submit" formAction={bambuBuddyImportAction} variant="secondary" className="shrink-0">Import data</Button> : null}
        </div>
      </div>
      {product?.bambuBuddyLastSyncedAt ? <div className="rounded-lg border border-slate-200 bg-surface-muted p-3 text-sm sm:col-span-2">
        <p className="font-medium text-slate-800">Imported BambuBuddy data</p>
        <dl className="mt-2 grid gap-2 text-slate-600 sm:grid-cols-3">
          <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Print time</dt><dd>{product.bambuBuddyPrintTimeSeconds === null ? "Not provided" : formatPrintDuration(product.bambuBuddyPrintTimeSeconds)}</dd></div>
          <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Filament used</dt><dd>{product.bambuBuddyFilamentUsedGrams === null ? "Not provided" : `${product.bambuBuddyFilamentUsedGrams.toString()} g`}</dd></div>
          <div><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Last imported</dt><dd>{formatDateTime(product.bambuBuddyLastSyncedAt)}</dd></div>
        </dl>
      </div> : null}
      </section>

      <section className="grid gap-4 rounded-xl border border-slate-200 bg-surface-muted p-4 sm:col-span-2 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <h2 className="font-semibold text-slate-900">Notes</h2>
          <p className="text-sm text-slate-500">Keep internal production and print instructions together.</p>
        </div>
      <div className="sm:col-span-2">
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="productionNotes">
          Production notes
        </label>
        <Textarea id="productionNotes" name="productionNotes" defaultValue={product?.productionNotes ?? ""} />
      </div>
      <div className="sm:col-span-2">
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="printNotes">
          Print notes
        </label>
        <Textarea id="printNotes" name="printNotes" defaultValue={product?.printNotes ?? ""} />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit">{submitLabel}</Button>
      </div>
      </section>
    </form>
  );
}
