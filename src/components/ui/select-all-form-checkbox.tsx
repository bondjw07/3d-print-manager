"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type SelectAllFormCheckboxProps = {
  formId: string;
  inputName: string;
  totalCount: number;
  className?: string;
  ariaLabel?: string;
};

function getTargetCheckboxes(formId: string, inputName: string) {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][name="${inputName}"][form="${formId}"]`),
  );
}

export function SelectAllFormCheckbox({
  formId,
  inputName,
  totalCount,
  className,
  ariaLabel = "Select all rows",
}: SelectAllFormCheckboxProps) {
  const [checkedCount, setCheckedCount] = useState(0);
  const checkboxRef = useRef<HTMLInputElement | null>(null);

  const syncCheckedCount = useCallback(() => {
    const checkboxes = getTargetCheckboxes(formId, inputName);
    setCheckedCount(checkboxes.filter((checkbox) => checkbox.checked).length);
  }, [formId, inputName]);

  useEffect(() => {
    const onChange = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }

      if (target.type !== "checkbox" || target.name !== inputName || target.getAttribute("form") !== formId) {
        return;
      }

      syncCheckedCount();
    };

    document.addEventListener("change", onChange);
    return () => document.removeEventListener("change", onChange);
  }, [formId, inputName, syncCheckedCount]);

  useEffect(() => {
    if (!checkboxRef.current) {
      return;
    }

    checkboxRef.current.indeterminate = checkedCount > 0 && checkedCount < totalCount;
  }, [checkedCount, totalCount]);

  const isAllSelected = totalCount > 0 && checkedCount === totalCount;

  const handleToggle = () => {
    const shouldSelectAll = !isAllSelected;
    const checkboxes = getTargetCheckboxes(formId, inputName);

    checkboxes.forEach((checkbox) => {
      checkbox.checked = shouldSelectAll;
    });

    setCheckedCount(shouldSelectAll ? totalCount : 0);
  };

  return (
    <input
      ref={checkboxRef}
      type="checkbox"
      checked={isAllSelected}
      onChange={handleToggle}
      disabled={totalCount === 0}
      aria-label={ariaLabel}
      className={cn(
        "h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    />
  );
}
