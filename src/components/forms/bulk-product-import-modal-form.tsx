"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type ProductImportMode = "single" | "bulk" | "creator" | "creatorMmf";

type ImportLogStatus = "imported" | "duplicate" | "failed" | "invalid" | "discovered";

type ImportLogEntry = {
  url: string;
  status: ImportLogStatus;
  message: string;
};

type CreatorDiscoveryResponse = {
  error?: string;
  result?: {
    creatorUrl: string;
    creatorName?: string;
    pagesScanned: number;
    discoveredCount: number;
    modelUrls: string[];
  };
};

type ProductImportResponse = {
  error?: string;
  result?: {
    source: string;
    wasDuplicate: boolean;
    importedImageCount: number;
    skippedDuplicateImageCount: number;
  };
};

function splitUrls(raw: string) {
  return raw
    .split(/\r?\n|,|;/g)
    .map((value) => value.trim())
    .filter(Boolean);
}

function statusBadgeClasses(status: ImportLogStatus) {
  if (status === "imported") return "bg-emerald-100 text-emerald-700";
  if (status === "duplicate") return "bg-sky-100 text-sky-700";
  if (status === "discovered") return "bg-amber-100 text-amber-700";
  return "bg-rose-100 text-rose-700";
}

function importModeLabel(mode: ProductImportMode) {
  if (mode === "single") return "single URL";
  if (mode === "creator") return "Thangs creator";
  if (mode === "creatorMmf") return "MyMiniFactory creator";
  return "bulk URL";
}

export function BulkProductImportModalForm({ mode = "bulk" }: { mode?: ProductImportMode }) {
  const router = useRouter();
  const [singleSourceUrl, setSingleSourceUrl] = useState("");
  const [sourceUrls, setSourceUrls] = useState("");
  const [creatorUrl, setCreatorUrl] = useState("");
  const [creatorMaxPages, setCreatorMaxPages] = useState("12");
  const [importImages, setImportImages] = useState<"true" | "false">("true");
  const [isRunning, setIsRunning] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [logs, setLogs] = useState<ImportLogEntry[]>([]);
  const [processedCount, setProcessedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [importedCount, setImportedCount] = useState(0);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const isCreatorMode = mode === "creator" || mode === "creatorMmf";
  const isThangsCreatorMode = mode === "creator";
  const isMyMiniFactoryCreatorMode = mode === "creatorMmf";

  useEffect(() => {
    setIsModalOpen(false);
    setIsRunning(false);
    setCurrentUrl(null);
    setLogs([]);
    setProcessedCount(0);
    setTotalCount(0);
    setImportedCount(0);
    setDuplicateCount(0);
    setFailedCount(0);
  }, [mode]);

  const progressPercent = totalCount > 0 ? Math.round((processedCount / totalCount) * 100) : 0;
  const canStart =
    !isRunning &&
    (mode === "single"
      ? singleSourceUrl.trim().length > 0
      : isCreatorMode
        ? creatorUrl.trim().length > 0
        : sourceUrls.trim().length > 0);
  const finished = !isRunning && totalCount > 0 && processedCount === totalCount;

  const summaryText = useMemo(() => {
    if (totalCount === 0) {
      if (mode === "single") {
        return "Enter a product URL to start importing.";
      }
      if (isThangsCreatorMode) {
        return "Enter a Thangs creator URL to discover and import products.";
      }
      if (isMyMiniFactoryCreatorMode) {
        return "Enter a MyMiniFactory creator username or profile URL to discover public objects and import products.";
      }
      return "Paste URLs to start a bulk import.";
    }

    if (isRunning) {
      return `Processing ${processedCount} of ${totalCount} URLs...`;
    }

    return `Completed ${totalCount} URLs: ${importedCount} imported, ${duplicateCount} duplicates, ${failedCount} failed.`;
  }, [
    duplicateCount,
    failedCount,
    importedCount,
    isMyMiniFactoryCreatorMode,
    isRunning,
    isThangsCreatorMode,
    mode,
    processedCount,
    totalCount,
  ]);

  const resetStateForRun = (count: number) => {
    setLogs([]);
    setProcessedCount(0);
    setImportedCount(0);
    setDuplicateCount(0);
    setFailedCount(0);
    setTotalCount(count);
    setCurrentUrl(null);
  };

  const appendLog = (entry: ImportLogEntry) => {
    setLogs((previous) => [entry, ...previous]);
  };

  const runBulkImport = async () => {
    setIsModalOpen(true);
    setIsRunning(true);
    resetStateForRun(0);

    const shouldImportImages = importImages === "true";
    let candidates: string[] = [];

    try {
      if (mode === "single") {
        candidates = Array.from(new Set(splitUrls(singleSourceUrl)));
      } else if (mode === "bulk") {
        candidates = Array.from(new Set(splitUrls(sourceUrls)));
      } else if (isCreatorMode) {
        const parsedMaxPages = Number.parseInt(creatorMaxPages, 10);
        const maxPages = Number.isFinite(parsedMaxPages) ? Math.min(40, Math.max(1, parsedMaxPages)) : 12;
        const creatorInput = creatorUrl.trim();

        if (!creatorInput) {
          appendLog({
            url: "-",
            status: "invalid",
            message: isThangsCreatorMode
              ? "Paste a Thangs creator URL first."
              : "Paste a MyMiniFactory creator username or profile URL first.",
          });
          setFailedCount(1);
          return;
        }

        setCurrentUrl(creatorInput);
        const discoveryEndpoint = isThangsCreatorMode
          ? "/api/admin/discover-thangs-creator"
          : "/api/admin/discover-myminifactory-creator";
        const discoveryRequestBody = isThangsCreatorMode
          ? { creatorUrl: creatorInput, maxPages }
          : { creator: creatorInput, maxPages };

        const discoveryResponse = await fetch(discoveryEndpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(discoveryRequestBody),
        });

        const discoveryPayload = (await discoveryResponse.json().catch(() => ({}))) as CreatorDiscoveryResponse;
        if (!discoveryResponse.ok || !discoveryPayload.result) {
          throw new Error(discoveryPayload.error || `Creator discovery failed (${discoveryResponse.status}).`);
        }

        candidates = Array.from(new Set(discoveryPayload.result.modelUrls));
        setTotalCount(candidates.length);
        appendLog({
          url: discoveryPayload.result.creatorUrl,
          status: "discovered",
          message: `Discovered ${discoveryPayload.result.discoveredCount} model URL${discoveryPayload.result.discoveredCount === 1 ? "" : "s"} across ${discoveryPayload.result.pagesScanned} page${discoveryPayload.result.pagesScanned === 1 ? "" : "s"}${discoveryPayload.result.creatorName ? ` for ${discoveryPayload.result.creatorName}` : ""}.`,
        });
      }

      if (candidates.length === 0) {
        appendLog({
          url: "-",
          status: "invalid",
          message:
            isCreatorMode
              ? "No model URLs were discovered for this creator."
              : "Paste at least one valid URL.",
        });
        setFailedCount((value) => value + 1);
        return;
      }

      setTotalCount(candidates.length);

      for (const rawUrl of candidates) {
        let normalizedUrl = rawUrl;

        try {
          normalizedUrl = new URL(rawUrl).toString();
        } catch {
          appendLog({
            url: rawUrl,
            status: "invalid",
            message: "Invalid URL format.",
          });
          setFailedCount((value) => value + 1);
          setProcessedCount((value) => value + 1);
          continue;
        }

        setCurrentUrl(normalizedUrl);

        try {
          const response = await fetch("/api/admin/import-product", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              sourceUrl: normalizedUrl,
              importImages: shouldImportImages,
            }),
          });

          const payload = (await response.json().catch(() => ({}))) as ProductImportResponse;

          if (!response.ok || !payload.result) {
            throw new Error(payload.error || `Import failed (${response.status}).`);
          }

          if (payload.result.wasDuplicate) {
            setDuplicateCount((value) => value + 1);
            appendLog({
              url: normalizedUrl,
              status: "duplicate",
              message: "Already imported. No duplicate product created.",
            });
          } else {
            setImportedCount((value) => value + 1);
            appendLog({
              url: normalizedUrl,
              status: "imported",
              message: `${payload.result.importedImageCount} image${payload.result.importedImageCount === 1 ? "" : "s"} imported, ${payload.result.skippedDuplicateImageCount} duplicate${payload.result.skippedDuplicateImageCount === 1 ? "" : "s"} skipped.`,
            });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Import failed.";
          setFailedCount((value) => value + 1);
          appendLog({
            url: normalizedUrl,
            status: "failed",
            message,
          });
        } finally {
          setProcessedCount((value) => value + 1);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import failed.";
      setFailedCount((value) => value + 1);
      appendLog({
        url: currentUrl ?? "-",
        status: "failed",
        message,
      });
    } finally {
      setCurrentUrl(null);
      setIsRunning(false);
      router.refresh();
    }
  };

  const closeModal = () => {
    if (isRunning) {
      return;
    }
    setIsModalOpen(false);
  };

  const modalTitle = mode === "single" ? "Import Progress" : isCreatorMode ? "Creator Import Progress" : "Bulk Import Progress";

  return (
    <>
      {mode === "single" ? (
        <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto]">
          <Input
            name="sourceUrl"
            type="url"
            value={singleSourceUrl}
            onChange={(event) => setSingleSourceUrl(event.target.value)}
            placeholder="https://thangs.com/... or https://www.myminifactory.com/object/..."
            required
          />
          <Select
            name="importImages"
            value={importImages}
            onChange={(event) => setImportImages(event.target.value as "true" | "false")}
          >
            <option value="true">Import images</option>
            <option value="false">Metadata only</option>
          </Select>
          <Button type="button" disabled={!canStart} onClick={runBulkImport}>
            Import URL
          </Button>
        </div>
      ) : null}

      {mode === "bulk" ? (
        <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto]">
          <Textarea
            name="sourceUrls"
            required
            value={sourceUrls}
            onChange={(event) => setSourceUrls(event.target.value)}
            className="sm:col-span-3"
            placeholder={`https://thangs.com/designer/.../3d-model/...-1537886\nhttps://www.myminifactory.com/object/...-770933`}
          />
          <Select
            name="importImages"
            value={importImages}
            onChange={(event) => setImportImages(event.target.value as "true" | "false")}
          >
            <option value="true">Import images</option>
            <option value="false">Metadata only</option>
          </Select>
          <div className="sm:col-span-2">
            <Button type="button" disabled={!canStart} onClick={runBulkImport}>
              Run Bulk Import
            </Button>
          </div>
        </div>
      ) : null}

      {isCreatorMode ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px_180px_auto]">
            <Input
              name="creatorUrl"
              type={isThangsCreatorMode ? "url" : "text"}
              value={creatorUrl}
              onChange={(event) => setCreatorUrl(event.target.value)}
              placeholder={
                isThangsCreatorMode
                  ? "https://thangs.com/designer/The%20Kit%20Kiln"
                  : "https://www.myminifactory.com/users/ExampleCreator or ExampleCreator"
              }
              required
            />
            <Input
              name="maxPages"
              type="number"
              min={1}
              max={40}
              value={creatorMaxPages}
              onChange={(event) => setCreatorMaxPages(event.target.value)}
              title="Maximum pages to scan"
            />
            <Select
              name="importImages"
              value={importImages}
              onChange={(event) => setImportImages(event.target.value as "true" | "false")}
            >
              <option value="true">Import images</option>
              <option value="false">Metadata only</option>
            </Select>
            <Button type="button" disabled={!canStart} onClick={runBulkImport}>
              Import Creator
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            {isThangsCreatorMode
              ? "Scans creator pages one at a time, discovers model URLs, then imports each product sequentially."
              : "Loads public objects from the MyMiniFactory creator API, then imports each product sequentially."}
          </p>
        </div>
      ) : null}

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/45 backdrop-blur-[1px]"
            aria-label="Close import progress"
            onClick={closeModal}
          />

          <div
            role="dialog"
            aria-modal="true"
            className="relative w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_28px_70px_-35px_rgba(15,23,42,0.5)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">{modalTitle}</h2>
                <p className="mt-1 text-sm text-slate-600">{summaryText}</p>
              </div>
              <Button type="button" variant="secondary" disabled={isRunning} onClick={closeModal}>
                Close
              </Button>
            </div>

            <div className="mt-4">
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-sky-600 transition-[width] duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {processedCount}/{totalCount} processed ({progressPercent}%)
              </p>
            </div>

            <div className="mt-4 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm sm:grid-cols-4">
              <p className="text-slate-700">
                Imported: <span className="font-semibold text-emerald-700">{importedCount}</span>
              </p>
              <p className="text-slate-700">
                Duplicates: <span className="font-semibold text-sky-700">{duplicateCount}</span>
              </p>
              <p className="text-slate-700">
                Failed: <span className="font-semibold text-rose-700">{failedCount}</span>
              </p>
              <p className="text-slate-700">
                Remaining: <span className="font-semibold text-slate-900">{Math.max(0, totalCount - processedCount)}</span>
              </p>
            </div>

            <div className="mt-4 max-h-[340px] overflow-y-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">URL</th>
                    <th className="px-3 py-2">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-4 text-slate-500">
                        {isRunning ? `Starting ${importModeLabel(mode)} import...` : "No activity yet."}
                      </td>
                    </tr>
                  ) : (
                    logs.map((entry, index) => (
                      <tr key={`${entry.url}-${index}`} className="border-b border-slate-100 align-top">
                        <td className="px-3 py-2">
                          <span
                            className={[
                              "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                              statusBadgeClasses(entry.status),
                            ].join(" ")}
                          >
                            {entry.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-600">{entry.url}</td>
                        <td className="px-3 py-2 text-xs text-slate-600">{entry.message}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {isRunning && currentUrl ? (
              <p className="mt-3 text-xs text-slate-500">Currently importing: {currentUrl}</p>
            ) : null}

            {finished ? (
              <div className="mt-4 flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => router.refresh()}>
                  Refresh List
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
