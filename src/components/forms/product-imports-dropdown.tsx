"use client";

import { useEffect, useRef, useState } from "react";
import { BulkProductImportModalForm, type ProductImportMode } from "./bulk-product-import-modal-form";
import { FilamentWeightCsvImportModalForm } from "./filament-weight-csv-import-modal-form";
import { Button } from "@/components/ui/button";

type ImportMode = ProductImportMode | "filamentWeightsCsv";

type ImportOption = {
  mode: ImportMode;
  label: string;
  description: string;
};

const importOptions: ImportOption[] = [
  {
    mode: "single",
    label: "Import Single URL",
    description: "Import one Thangs or MyMiniFactory URL into a draft product.",
  },
  {
    mode: "bulk",
    label: "Bulk Import URLs",
    description: "Paste multiple product URLs and process them one at a time.",
  },
  {
    mode: "creator",
    label: "Import Thangs Creator",
    description: "Discover all products from a Thangs creator page and import sequentially.",
  },
  {
    mode: "filamentWeightsCsv",
    label: "Import Filament Weights CSV",
    description: "Upload a model-weight CSV, review fuzzy matches, then apply selected product/filament updates.",
  },
];

export function ProductImportsDropdown() {
  const [selectedMode, setSelectedMode] = useState<ImportMode>("single");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current) {
        return;
      }

      if (!menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const selectedOption = importOptions.find((option) => option.mode === selectedMode) ?? importOptions[0];

  return (
    <div className="space-y-4">
      <div className="relative inline-block" ref={menuRef}>
        <Button
          type="button"
          variant="secondary"
          className="gap-2"
          onClick={() => setIsMenuOpen((previous) => !previous)}
        >
          Imports
          <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            {selectedOption.label}
          </span>
        </Button>

        {isMenuOpen ? (
          <div className="absolute left-0 top-[calc(100%+8px)] z-20 w-80 rounded-xl border border-slate-200 bg-white p-2 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.45)]">
            {importOptions.map((option) => {
              const isSelected = option.mode === selectedMode;
              return (
                <button
                  key={option.mode}
                  type="button"
                  onClick={() => {
                    setSelectedMode(option.mode);
                    setIsMenuOpen(false);
                  }}
                  className={[
                    "w-full rounded-lg px-3 py-2 text-left transition-colors",
                    isSelected ? "bg-slate-900 text-white" : "hover:bg-slate-50",
                  ].join(" ")}
                >
                  <p className="text-sm font-medium">{option.label}</p>
                  <p className={["mt-0.5 text-xs", isSelected ? "text-slate-200" : "text-slate-500"].join(" ")}>
                    {option.description}
                  </p>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-900">{selectedOption.label}</h3>
        <p className="mt-1 text-sm text-slate-500">{selectedOption.description}</p>
        <div className="mt-4">
          {selectedMode === "filamentWeightsCsv" ? (
            <FilamentWeightCsvImportModalForm />
          ) : (
            <BulkProductImportModalForm mode={selectedMode} />
          )}
        </div>
      </div>
    </div>
  );
}
