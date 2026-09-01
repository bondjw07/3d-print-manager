"use client";

import { useEffect, useRef, useState, type DetailsHTMLAttributes } from "react";

type DismissibleDetailsProps = DetailsHTMLAttributes<HTMLDetailsElement> & {
  defaultOpen?: boolean;
};

export function DismissibleDetails({ defaultOpen = false, children, ...props }: DismissibleDetailsProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    const closeWhenClickingOutside = (event: PointerEvent) => {
      if (detailsRef.current && !detailsRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeWhenClickingOutside);
    return () => document.removeEventListener("pointerdown", closeWhenClickingOutside);
  }, []);

  return (
    <details
      {...props}
      ref={detailsRef}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      {children}
    </details>
  );
}
