import type { Product } from "@/generated/prisma/client";
import {
  inventoryModeOptions,
  productStatusOptions,
  humanizeEnum,
} from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function ProductForm({
  product,
  action,
  redirectTo,
  submitLabel,
}: {
  product?: Product;
  action: (formData: FormData) => void | Promise<void>;
  redirectTo: string;
  submitLabel: string;
}) {
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {product ? <input type="hidden" name="productId" value={product.id} /> : null}
      <input type="hidden" name="redirectTo" value={redirectTo} />

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="internalName">
          Internal name
        </label>
        <Input id="internalName" name="internalName" required defaultValue={product?.internalName ?? ""} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="publicName">
          Public name
        </label>
        <Input id="publicName" name="publicName" required defaultValue={product?.publicName ?? ""} />
      </div>

      <div className="sm:col-span-2">
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="shortDescription">
          Short description
        </label>
        <Input id="shortDescription" name="shortDescription" required defaultValue={product?.shortDescription ?? ""} />
      </div>

      <div className="sm:col-span-2">
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="fullDescription">
          Full description
        </label>
        <Textarea id="fullDescription" name="fullDescription" required defaultValue={product?.fullDescription ?? ""} />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="category">
          Category
        </label>
        <Input id="category" name="category" required defaultValue={product?.category ?? ""} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="tags">
          Tags (comma-separated)
        </label>
        <Input id="tags" name="tags" defaultValue={product?.tags?.join(", ") ?? ""} />
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

      <div className="sm:col-span-2">
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
