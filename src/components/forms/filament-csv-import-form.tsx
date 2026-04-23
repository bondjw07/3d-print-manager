"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type FilamentCsvImportResponse = {
  error?: string;
  result?: {
    totalRows: number;
    createdCount: number;
    duplicateCount: number;
    invalidCount: number;
    warnings: string[];
  };
};

export function FilamentCsvImportForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
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

      const response = await fetch("/api/admin/import-filaments", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json().catch(() => ({}))) as FilamentCsvImportResponse;
      if (!response.ok || !payload.result) {
        throw new Error(payload.error || `Import failed (${response.status}).`);
      }

      const { totalRows, createdCount, duplicateCount, invalidCount, warnings: importWarnings } = payload.result;
      setWarnings(importWarnings);
      setSuccessMessage(
        `Processed ${totalRows} row${totalRows === 1 ? "" : "s"}: ${createdCount} created, ${duplicateCount} duplicate${duplicateCount === 1 ? "" : "s"} skipped, ${invalidCount} invalid.`,
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

      <p className="text-xs text-slate-500">
        Required headers: <span className="font-semibold">name</span>, <span className="font-semibold">color</span>,
        and <span className="font-semibold">material type</span>. Optional:{" "}
        <span className="font-semibold">brand</span>.
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
              <li key={`filament-import-warning-${index}`}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
