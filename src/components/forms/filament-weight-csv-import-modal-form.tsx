"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableContainer } from "@/components/ui/table";

type MatchConfidence = "HIGH" | "MEDIUM" | "LOW";

type CsvPreviewRow = {
  rowKey: string;
  csvRowIndex: number;
  csvModelName: string;
  csvTotalWeightGrams: number | null;
  matchedProduct:
    | {
        id: string;
        publicName: string;
        internalName: string;
        score: number;
        confidence: MatchConfidence;
      }
    | null;
  filamentMatches: Array<{
    csvFilamentName: string;
    grams: number;
    matchedFilament:
      | {
          id: string;
          name: string;
          colorLabel: string;
          score: number;
          confidence: MatchConfidence;
        }
      | null;
  }>;
  unmatchedFilamentCount: number;
  hasProductConflict: boolean;
  canApply: boolean;
  warnings: string[];
};

type CsvPreviewResponse = {
  error?: string;
  result?: {
    headerRowIndex: number;
    rows: CsvPreviewRow[];
    summary: {
      totalRows: number;
      matchedRows: number;
      unmatchedRows: number;
      conflictedRows: number;
      totalFilamentValues: number;
      matchedFilamentValues: number;
      unmatchedFilamentValues: number;
      applyableRows: number;
    };
  };
};

type CsvApplyResponse = {
  error?: string;
  result?: {
    processedRows: number;
    productsTouched: number;
    productWeightUpdates: number;
    filamentRequirementCreates: number;
    filamentRequirementUpdates: number;
  };
};

function confidenceBadgeClasses(confidence: MatchConfidence) {
  if (confidence === "HIGH") {
    return "bg-emerald-100 text-emerald-700";
  }
  if (confidence === "MEDIUM") {
    return "bg-amber-100 text-amber-700";
  }
  return "bg-rose-100 text-rose-700";
}

export function FilamentWeightCsvImportModalForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [preview, setPreview] = useState<CsvPreviewResponse["result"] | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(new Set());
  const [isApplying, setIsApplying] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);

  const selectableRowKeys = useMemo(
    () => preview?.rows.filter((row) => row.canApply && !row.hasProductConflict).map((row) => row.rowKey) ?? [],
    [preview],
  );
  const selectedCount = useMemo(
    () => preview?.rows.filter((row) => row.canApply && selectedRowKeys.has(row.rowKey)).length ?? 0,
    [preview, selectedRowKeys],
  );
  const allSelectableChecked = selectableRowKeys.length > 0 && selectedCount === selectableRowKeys.length;

  const runPreview = async () => {
    if (!file) {
      setErrorMessage("Select a CSV file first.");
      return;
    }

    setErrorMessage(null);
    setApplyMessage(null);
    setIsReviewing(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/admin/import-filament-weights/preview", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json().catch(() => ({}))) as CsvPreviewResponse;

      if (!response.ok || !payload.result) {
        throw new Error(payload.error || `Preview failed (${response.status}).`);
      }

      setPreview(payload.result);
      setSelectedRowKeys(
        new Set(payload.result.rows.filter((row) => row.canApply && !row.hasProductConflict).map((row) => row.rowKey)),
      );
      setIsModalOpen(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Preview failed.";
      setErrorMessage(message);
    } finally {
      setIsReviewing(false);
    }
  };

  const toggleSelectAll = () => {
    if (allSelectableChecked) {
      setSelectedRowKeys(new Set());
      return;
    }
    setSelectedRowKeys(new Set(selectableRowKeys));
  };

  const toggleRow = (rowKey: string) => {
    setSelectedRowKeys((current) => {
      const next = new Set(current);
      if (next.has(rowKey)) {
        next.delete(rowKey);
      } else {
        next.add(rowKey);
      }
      return next;
    });
  };

  const closeModal = () => {
    if (isReviewing || isApplying) {
      return;
    }
    setIsModalOpen(false);
  };

  const applyImport = async () => {
    if (!preview) {
      return;
    }

    const rowsToApply = preview.rows
      .filter((row) => row.canApply && selectedRowKeys.has(row.rowKey) && row.matchedProduct)
      .map((row) => ({
        rowKey: row.rowKey,
        csvRowIndex: row.csvRowIndex,
        csvModelName: row.csvModelName,
        productId: row.matchedProduct!.id,
        totalWeightGrams: row.csvTotalWeightGrams,
        filamentAssignments: row.filamentMatches
          .filter((filamentMatch) => filamentMatch.matchedFilament)
          .map((filamentMatch) => ({
            filamentId: filamentMatch.matchedFilament!.id,
            csvFilamentName: filamentMatch.csvFilamentName,
            grams: filamentMatch.grams,
          })),
      }));

    if (rowsToApply.length === 0) {
      setErrorMessage("Select at least one matched row to apply.");
      return;
    }

    setErrorMessage(null);
    setApplyMessage(null);
    setIsApplying(true);

    try {
      const response = await fetch("/api/admin/import-filament-weights/apply", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          rows: rowsToApply,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as CsvApplyResponse;
      if (!response.ok || !payload.result) {
        throw new Error(payload.error || `Apply failed (${response.status}).`);
      }

      setApplyMessage(
        `Updated ${payload.result.processedRows} row${payload.result.processedRows === 1 ? "" : "s"} across ${payload.result.productsTouched} product${payload.result.productsTouched === 1 ? "" : "s"}. Product weights: ${payload.result.productWeightUpdates}. Filament requirements: ${payload.result.filamentRequirementCreates} created, ${payload.result.filamentRequirementUpdates} updated.`,
      );
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Apply failed.";
      setErrorMessage(message);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <Button type="button" variant="secondary" disabled={!file || isReviewing} onClick={runPreview}>
            {isReviewing ? "Reviewing..." : "Review CSV Import"}
          </Button>
        </div>

        <p className="text-xs text-slate-500">
          Upload your model-weight CSV, review model and filament matches, then apply only the rows you select.
        </p>

        {errorMessage ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</p>
        ) : null}
        {applyMessage ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {applyMessage}
          </p>
        ) : null}
      </div>

      {isModalOpen && preview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/45 backdrop-blur-[1px]"
            aria-label="Close CSV import preview"
            onClick={closeModal}
          />

          <div
            role="dialog"
            aria-modal="true"
            className="relative flex max-h-[92vh] w-full max-w-7xl flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_28px_70px_-35px_rgba(15,23,42,0.5)]"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">CSV Import Confirmation</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Review matches below, uncheck anything you do not want to apply, then run the update.
                </p>
              </div>
              <Button type="button" variant="secondary" disabled={isReviewing || isApplying} onClick={closeModal}>
                Close
              </Button>
            </div>

            <div className="mt-4 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <p className="text-slate-700">
                Rows: <span className="font-semibold text-slate-900">{preview.summary.totalRows}</span>
              </p>
              <p className="text-slate-700">
                Product matches: <span className="font-semibold text-emerald-700">{preview.summary.matchedRows}</span>
              </p>
              <p className="text-slate-700">
                Filament matches:{" "}
                <span className="font-semibold text-sky-700">
                  {preview.summary.matchedFilamentValues}/{preview.summary.totalFilamentValues}
                </span>
              </p>
              <p className="text-slate-700">
                Selected: <span className="font-semibold text-slate-900">{selectedCount}</span>
              </p>
            </div>

            {errorMessage ? (
              <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorMessage}</p>
            ) : null}
            {applyMessage ? (
              <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {applyMessage}
              </p>
            ) : null}

            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={allSelectableChecked}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                Select all ready rows
              </label>

              <Button type="button" disabled={selectedCount === 0 || isApplying} onClick={applyImport}>
                {isApplying ? "Applying..." : "Apply Selected Updates"}
              </Button>
            </div>

            <TableContainer className="mt-4 flex-1 rounded-xl border border-slate-200">
              <Table>
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-2">
                      <span className="sr-only">Select</span>
                    </th>
                    <th className="px-2 py-2">CSV Model</th>
                    <th className="px-2 py-2">Matched Product</th>
                    <th className="px-2 py-2">Total Weight</th>
                    <th className="px-2 py-2">Filament Mapping</th>
                    <th className="px-2 py-2">Warnings</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => {
                    const matchedFilamentCount = row.filamentMatches.filter((entry) => entry.matchedFilament).length;
                    return (
                      <tr key={row.rowKey} className="align-top border-b border-slate-100">
                        <td className="px-2 py-3">
                          <input
                            type="checkbox"
                            checked={selectedRowKeys.has(row.rowKey)}
                            onChange={() => toggleRow(row.rowKey)}
                            disabled={!row.canApply}
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
                          />
                        </td>

                        <td className="px-2 py-3">
                          <p className="font-medium text-slate-900">{row.csvModelName}</p>
                          <p className="text-xs text-slate-500">CSV row {row.csvRowIndex + 1}</p>
                        </td>

                        <td className="px-2 py-3">
                          {row.matchedProduct ? (
                            <div className="space-y-1">
                              <p className="font-medium text-slate-900">{row.matchedProduct.publicName}</p>
                              <p className="text-xs text-slate-500">{row.matchedProduct.internalName}</p>
                              <span
                                className={[
                                  "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                                  confidenceBadgeClasses(row.matchedProduct.confidence),
                                ].join(" ")}
                              >
                                {row.matchedProduct.confidence} ({Math.round(row.matchedProduct.score * 100)}%)
                              </span>
                            </div>
                          ) : (
                            <p className="text-sm text-rose-700">No product match</p>
                          )}
                        </td>

                        <td className="px-2 py-3 text-sm text-slate-700">
                          {row.csvTotalWeightGrams ? `${row.csvTotalWeightGrams} g` : <span className="text-slate-500">None</span>}
                        </td>

                        <td className="px-2 py-3">
                          <div className="space-y-1">
                            {row.filamentMatches.map((filamentMatch) => (
                              <div
                                key={`${row.rowKey}-${filamentMatch.csvFilamentName}`}
                                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1"
                              >
                                <p className="text-xs text-slate-600">
                                  {filamentMatch.csvFilamentName}: <span className="font-semibold">{filamentMatch.grams} g</span>
                                </p>
                                {filamentMatch.matchedFilament ? (
                                  <p className="mt-0.5 text-xs text-slate-700">
                                    {filamentMatch.matchedFilament.name} ({Math.round(filamentMatch.matchedFilament.score * 100)}%)
                                  </p>
                                ) : (
                                  <p className="mt-0.5 text-xs text-rose-700">No filament match</p>
                                )}
                              </div>
                            ))}

                            {row.filamentMatches.length === 0 ? (
                              <p className="text-xs text-slate-500">No filament grams in CSV row.</p>
                            ) : null}

                            <p className="text-xs text-slate-500">
                              Matched {matchedFilamentCount}/{row.filamentMatches.length} filament values
                            </p>
                          </div>
                        </td>

                        <td className="px-2 py-3">
                          {row.warnings.length > 0 ? (
                            <div className="space-y-1">
                              {row.warnings.map((warning, index) => (
                                <p key={`${row.rowKey}-warning-${index}`} className="text-xs text-rose-700">
                                  {warning}
                                </p>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-emerald-700">Ready</p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </TableContainer>
          </div>
        </div>
      ) : null}
    </>
  );
}
