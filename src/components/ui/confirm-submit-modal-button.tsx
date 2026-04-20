"use client";

import { useId, useRef, useState, type MouseEvent } from "react";
import { Button } from "./button";
import { Input } from "./input";

type ConfirmSubmitModalButtonProps = Omit<React.ComponentProps<typeof Button>, "type"> & {
  confirmTitle: string;
  confirmMessage: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmationKeyword?: string;
  confirmationInputName?: string;
};

export function ConfirmSubmitModalButton({
  confirmTitle,
  confirmMessage,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmationKeyword,
  confirmationInputName = "confirmWord",
  children,
  ...buttonProps
}: ConfirmSubmitModalButtonProps) {
  const [open, setOpen] = useState(false);
  const [confirmationValue, setConfirmationValue] = useState("");
  const submitRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const confirmationId = useId();
  const requiresKeyword = Boolean(confirmationKeyword?.trim());
  const expectedKeyword = confirmationKeyword?.trim().toLowerCase() ?? "";
  const isKeywordSatisfied = !requiresKeyword || confirmationValue.trim().toLowerCase() === expectedKeyword;

  const openDialog = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    formRef.current = event.currentTarget.form;
    setConfirmationValue("");
    setOpen(true);
  };

  const closeDialog = () => {
    setConfirmationValue("");
    setOpen(false);
  };

  const confirmAndSubmit = () => {
    if (!isKeywordSatisfied) {
      return;
    }

    const form = formRef.current ?? submitRef.current?.form;
    if (form) {
      form.requestSubmit(submitRef.current ?? undefined);
    }
    setConfirmationValue("");
    setOpen(false);
  };

  return (
    <>
      <Button {...buttonProps} type="button" onClick={openDialog}>
        {children}
      </Button>
      {requiresKeyword ? <input type="hidden" name={confirmationInputName} value={confirmationValue} /> : null}
      <button ref={submitRef} type="submit" className="hidden" aria-hidden tabIndex={-1} />

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close confirmation dialog"
            className="absolute inset-0 bg-slate-900/45 backdrop-blur-[1px]"
            onClick={closeDialog}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_28px_70px_-35px_rgba(15,23,42,0.5)]"
          >
            <h2 id={titleId} className="text-base font-semibold text-slate-900">
              {confirmTitle}
            </h2>
            <p id={descriptionId} className="mt-2 text-sm text-slate-600">
              {confirmMessage}
            </p>
            {requiresKeyword ? (
              <div className="mt-4 space-y-2">
                <label htmlFor={confirmationId} className="block text-xs font-medium uppercase tracking-wide text-slate-600">
                  Type &quot;{confirmationKeyword}&quot; to confirm
                </label>
                <Input
                  id={confirmationId}
                  value={confirmationValue}
                  onChange={(event) => setConfirmationValue(event.target.value)}
                  placeholder={confirmationKeyword}
                  autoComplete="off"
                  autoFocus
                />
              </div>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={closeDialog}>
                {cancelLabel}
              </Button>
              <Button type="button" variant="danger" onClick={confirmAndSubmit} disabled={!isKeywordSatisfied}>
                {confirmLabel}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
