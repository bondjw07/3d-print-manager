"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { submitRequestAction } from "@/server/actions/portal-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type RequestAsOption = {
  id: string;
  name: string;
  email: string;
};

type RequestPrintModalButtonProps = {
  productId: string;
  productName: string;
  productSlug: string;
  redirectTo: string;
  canSubmitRequest: boolean;
  isAdmin?: boolean;
  requestAsOptions?: RequestAsOption[];
  requestAsDefaultUserId?: string;
  buttonLabel?: string;
  buttonVariant?: React.ComponentProps<typeof Button>["variant"];
  buttonClassName?: string;
};

export function RequestPrintModalButton({
  productId,
  productName,
  productSlug,
  redirectTo,
  canSubmitRequest,
  isAdmin = false,
  requestAsOptions = [],
  requestAsDefaultUserId,
  buttonLabel = "Request",
  buttonVariant = "secondary",
  buttonClassName,
}: RequestPrintModalButtonProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const descriptionId = useId();

  const closeModal = () => setOpen(false);

  return (
    <>
      <Button size="sm" variant={buttonVariant} className={buttonClassName} onClick={() => setOpen(true)}>
        {buttonLabel}
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close request dialog"
            className="absolute inset-0 bg-slate-900/45 backdrop-blur-[1px]"
            onClick={closeModal}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_28px_70px_-35px_rgba(15,23,42,0.5)]"
          >
            <h2 id={titleId} className="text-base font-semibold text-slate-900">
              Request a Print
            </h2>
            <p id={descriptionId} className="mt-2 text-sm text-slate-600">
              Submit a request for <span className="font-medium text-slate-900">{productName}</span>.
            </p>

            {canSubmitRequest ? (
              <form action={submitRequestAction} className="mt-4 grid gap-3">
                <input type="hidden" name="redirectTo" value={redirectTo} />
                <input type="hidden" name="productId" value={productId} />
                {isAdmin ? (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor={`${productId}-requestAsUserId`}>
                      Request as
                    </label>
                    <Select
                      id={`${productId}-requestAsUserId`}
                      name="requestAsUserId"
                      defaultValue={requestAsDefaultUserId ?? ""}
                      required
                    >
                      {requestAsOptions.map((requestAsUser) => (
                        <option key={requestAsUser.id} value={requestAsUser.id}>
                          {requestAsUser.name} ({requestAsUser.email})
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : null}
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor={`${productId}-quantity`}>
                    Quantity
                  </label>
                  <Input
                    id={`${productId}-quantity`}
                    name="quantity"
                    type="number"
                    min={1}
                    max={50}
                    defaultValue={1}
                    autoFocus
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor={`${productId}-notes`}>
                    Notes (optional)
                  </label>
                  <Textarea
                    id={`${productId}-notes`}
                    name="notes"
                    placeholder="Color preference, due date, or special instructions"
                  />
                </div>
                <div className="mt-1 flex justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={closeModal}>
                    Cancel
                  </Button>
                  <Button type="submit">Submit Request</Button>
                </div>
              </form>
            ) : (
              <div className="mt-4 space-y-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
                <p>Sign in as a request user or admin to submit this request.</p>
                <div className="flex flex-wrap gap-2">
                  <Link href="/login">
                    <Button size="sm">Go to sign in</Button>
                  </Link>
                  <Link href={`/catalog/${productSlug}`}>
                    <Button size="sm" variant="ghost">
                      View details
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
