"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ProductCsvImportResponse = {
  error?: string;
  result?: {
    totalRows: number;
    importedCount: number;
    duplicateCount: number;
    invalidCount: number;
    failedCount: number;
    importedImageCount: number;
    skippedImageCount: number;
    warnings: string[];
  };
};

export function ProductCsvImportForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [importImages, setImportImages] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const runImport = async () => {
    if (!file) {
      setErrorMessage("Select a CSV file first.");
      return;
    }

    setIsImporting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setWarnings([]);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("importImages", String(importImages));

      const response = await fetch("/api/admin/import-products-csv", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json().catch(() => ({}))) as ProductCsvImportResponse;
      if (!response.ok || !payload.result) {
        throw new Error(payload.error || `Import failed (${response.status}).`);
      }

      const {
        totalRows,
        importedCount,
        duplicateCount,
        invalidCount,
        failedCount,
        importedImageCount,
        skippedImageCount,
        warnings: importWarnings,
      } = payload.result;

      setWarnings(importWarnings);
      setSuccessMessage(
        `Processed ${totalRows} row${totalRows === 1 ? "" : "s"}: ${importedCount} imported, ${duplicateCount} duplicate${duplicateCount === 1 ? "" : "s"} skipped, ${invalidCount} invalid, ${failedCount} failed. Images: ${importedImageCount} added, ${skippedImageCount} skipped.`,
      );

      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import failed.";
      setErrorMessage(message);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <Input
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <Button type="button" variant="secondary" disabled={!file || isImporting} onClick={runImport}>
          {isImporting ? "Importing..." : "Import CSV"}
        </Button>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
          checked={importImages}
          onChange={(event) => setImportImages(event.target.checked)}
          disabled={isImporting}
        />
        Download and attach image URLs from CSV
      </label>

      <p className="text-xs text-slate-500">
        Required headers: <span className="font-semibold">url</span>, <span className="font-semibold">images</span>, and{" "}
        <span className="font-semibold">originalId</span>. Recommended: <span className="font-semibold">name</span>,{" "}
        <span className="font-semibold">description</span>, <span className="font-semibold">creatorname</span>. For multiple images, use
        <span className="font-semibold"> | </span> separators or a JSON array in <span className="font-semibold">images</span>.
      </p>

      {errorMessage ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</p>
      ) : null}
      {successMessage ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {successMessage}
        </p>
      ) : null}
      {warnings.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-sm font-medium text-amber-800">Import warnings</p>
          <ul className="mt-1 space-y-1 text-xs text-amber-800">
            {warnings.map((warning, index) => (
              <li key={`product-import-warning-${index}`}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
