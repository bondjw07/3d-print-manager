"use client";

import { useId, useState } from "react";
import { createQueueItemAction } from "@/server/actions/portal-actions";
import { humanizeEnum, queuePriorityOptions, queueSourceTypeOptions, queueStatusOptions } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type ProductOption = {
  id: string;
  publicName: string;
};

type RequestUserOption = {
  id: string;
  name: string;
};

type CreateQueueItemModalButtonProps = {
  products: ProductOption[];
  users: RequestUserOption[];
};

export function CreateQueueItemModalButton({ products, users }: CreateQueueItemModalButtonProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const descriptionId = useId();

  const closeModal = () => setOpen(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Create Queue Item</Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close create queue item dialog"
            className="absolute inset-0 bg-slate-900/45 backdrop-blur-[1px]"
            onClick={closeModal}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_28px_70px_-35px_rgba(15,23,42,0.5)]"
          >
            <h2 id={titleId} className="text-base font-semibold text-slate-900">
              Create Queue Item
            </h2>
            <p id={descriptionId} className="mt-2 text-sm text-slate-600">
              Add manual, restock, or external work to the print queue.
            </p>

            <form action={createQueueItemAction} className="mt-4 grid gap-2 sm:grid-cols-2">
              <input type="hidden" name="redirectTo" value="/admin/queue" />
              <Select name="productId" defaultValue="" required>
                <option value="" disabled>
                  Select product
                </option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.publicName}
                  </option>
                ))}
              </Select>
              <Select name="sourceType" defaultValue="MANUAL">
                {queueSourceTypeOptions.map((source) => (
                  <option key={source} value={source}>
                    {humanizeEnum(source)}
                  </option>
                ))}
              </Select>
              <Input name="sourceReferenceId" placeholder="Source reference id" />
              <Select name="requesterUserId" defaultValue="">
                <option value="">No requester</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </Select>
              <Input type="number" name="quantity" defaultValue={1} min={1} required />
              <Select name="priority" defaultValue="NORMAL">
                {queuePriorityOptions.map((priority) => (
                  <option key={priority} value={priority}>
                    {humanizeEnum(priority)}
                  </option>
                ))}
              </Select>
              <Select name="status" defaultValue="PENDING">
                {queueStatusOptions.map((status) => (
                  <option key={status} value={status}>
                    {humanizeEnum(status)}
                  </option>
                ))}
              </Select>
              <Input type="datetime-local" name="dueDate" />
              <Textarea name="notes" className="sm:col-span-2" placeholder="Operational notes" />
              <div className="mt-1 flex justify-end gap-2 sm:col-span-2">
                <Button type="button" variant="secondary" onClick={closeModal}>
                  Cancel
                </Button>
                <Button type="submit">Create Queue Item</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
