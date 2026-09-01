import { prisma } from "@/lib/prisma";
import { deriveProcessingState } from "@/lib/product-processing";
import type { SourcePackageManifest } from "@/server/files/zip-package-service";

export const processingQueuePageSize = 25;

export type ProcessingQueueFilters = {
  q?: string;
  category?: string;
  tag?: string;
  completion?: "incomplete" | "complete" | "all";
  source?: "present" | "missing" | "all";
  state?: string;
  page?: number;
};

function mappingPlateCount(inspection: unknown) {
  if (!inspection || typeof inspection !== "object" || Array.isArray(inspection)) return null;
  const plates = (inspection as { plates?: unknown }).plates;
  return Array.isArray(plates) ? plates.length : null;
}

export async function getProcessingQueue(filters: ProcessingQueueFilters) {
  const completion = filters.completion ?? "incomplete";
  const source = filters.source ?? "all";
  const products = await prisma.product.findMany({
    where: {
      ...(filters.q?.trim() ? { OR: [
        { publicName: { contains: filters.q.trim(), mode: "insensitive" } },
        { internalName: { contains: filters.q.trim(), mode: "insensitive" } },
        { sku: { contains: filters.q.trim(), mode: "insensitive" } },
      ] } : {}),
      ...(filters.category?.trim() ? { category: filters.category.trim() } : {}),
      ...(filters.tag?.trim() ? { tags: { has: filters.tag.trim() } } : {}),
      ...(completion === "incomplete" ? { bambuBuddyFileId: null } : completion === "complete" ? { bambuBuddyFileId: { not: null } } : {}),
      ...(source === "missing" ? { sourceFiles: { none: {} } } : source === "present" ? { sourceFiles: { some: {} } } : {}),
    },
    select: {
      id: true,
      publicName: true,
      internalName: true,
      sku: true,
      category: true,
      tags: true,
      importSourceUrl: true,
      importSourceCreatorName: true,
      bambuBuddyFileId: true,
      images: {
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
        take: 1,
        select: { imagePath: true, altText: true },
      },
      sourceFiles: {
        orderBy: { createdAt: "desc" },
        select: { id: true, originalName: true, inspectionStatus: true, threeMfCandidateCount: true, inspectionError: true, packageManifest: true },
      },
      artifacts: {
        select: { kind: true, sha256: true, basedOnProcessedSha256: true, publishedSha256: true, downloadName: true, lastPublishError: true, sizeBytes: true },
      },
      fileJobs: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, kind: true, status: true, phase: true, progress: true, error: true, createdAt: true },
      },
      mappingDraft: { select: { inspection: true, sourceFileId: true, entryPath: true } },
    },
    orderBy: [{ publicName: "asc" }],
  });

  const rows = products.map((product) => {
    const processed = product.artifacts.find((artifact) => artifact.kind === "PROCESSED_3MF") ?? null;
    const printReady = product.artifacts.find((artifact) => artifact.kind === "PRINT_READY") ?? null;
    const state = deriveProcessingState({
      bambuBuddyFileId: product.bambuBuddyFileId,
      importSourceCreatorName: product.importSourceCreatorName,
      sourceFiles: product.sourceFiles,
      processed,
      printReady,
      latestJob: product.fileJobs[0] ?? null,
      mappingPlateCount: mappingPlateCount(product.mappingDraft?.inspection),
    });
    const candidates = product.sourceFiles.flatMap((sourceFile) => {
      const manifest = sourceFile.packageManifest as SourcePackageManifest | null;
      return (manifest?.threeMfCandidates ?? []).map((candidate) => ({ ...candidate, sourceFileId: sourceFile.id, sourceName: sourceFile.originalName }));
    });
    return {
      id: product.id,
      publicName: product.publicName,
      internalName: product.internalName,
      sku: product.sku,
      category: product.category,
      tags: product.tags,
      creatorProductUrl: product.importSourceUrl,
      image: product.images[0] ?? null,
      bambuBuddyFileId: product.bambuBuddyFileId,
      creatorName: product.importSourceCreatorName,
      hasSource: product.sourceFiles.length > 0,
      state,
      latestJobId: product.fileJobs[0]?.id ?? null,
      reviewCandidate: candidates.length === 1 ? candidates[0] : product.mappingDraft ? {
        sourceFileId: product.mappingDraft.sourceFileId,
        entryPath: product.mappingDraft.entryPath,
        fileName: "Selected 3MF",
        sizeBytes: "0",
        sourceName: "Selected source",
      } : null,
      processed: processed ? { downloadName: processed.downloadName, sizeBytes: processed.sizeBytes.toString(), sha256: processed.sha256 } : null,
      printReady: printReady ? { downloadName: printReady.downloadName, sha256: printReady.sha256 } : null,
    };
  });

  const stateCounts = rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.state.key] = (counts[row.state.key] ?? 0) + 1;
    return counts;
  }, {});
  stateCounts.NEEDS_PRINT_READY = (stateCounts.PROCESSED_READY ?? 0) + (stateCounts.NEEDS_UPDATED_PRINT_READY ?? 0);
  const filteredRows = filters.state === "NEEDS_PRINT_READY"
    ? rows.filter((row) => row.state.key === "PROCESSED_READY" || row.state.key === "NEEDS_UPDATED_PRINT_READY")
    : filters.state ? rows.filter((row) => row.state.key === filters.state) : rows;
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / processingQueuePageSize));
  const page = Math.min(Math.max(1, filters.page ?? 1), pageCount);
  const start = (page - 1) * processingQueuePageSize;
  return {
    rows: filteredRows.slice(start, start + processingQueuePageSize),
    total: filteredRows.length,
    page,
    pageCount,
    stateCounts,
  };
}

export async function getProcessingQueueFacets() {
  const products = await prisma.product.findMany({ select: { category: true, tags: true } });
  return {
    categories: Array.from(new Set(products.map((product) => product.category).filter(Boolean))).sort(),
    tags: Array.from(new Set(products.flatMap((product) => product.tags))).sort((left, right) => left.localeCompare(right)),
  };
}

export type ProcessingQueueRow = Awaited<ReturnType<typeof getProcessingQueue>>["rows"][number];

export async function getProcessingStatuses(productIds: string[]) {
  if (!productIds.length) return [];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      bambuBuddyFileId: true,
      importSourceCreatorName: true,
      sourceFiles: { select: { inspectionStatus: true, threeMfCandidateCount: true, inspectionError: true } },
      artifacts: { select: { kind: true, sha256: true, basedOnProcessedSha256: true, publishedSha256: true, lastPublishError: true } },
      fileJobs: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, kind: true, status: true, phase: true, error: true } },
      mappingDraft: { select: { inspection: true } },
    },
  });
  return products.map((product) => ({
    id: product.id,
    latestJobId: product.fileJobs[0]?.id ?? null,
    state: deriveProcessingState({
      bambuBuddyFileId: product.bambuBuddyFileId,
      importSourceCreatorName: product.importSourceCreatorName,
      sourceFiles: product.sourceFiles,
      processed: product.artifacts.find((artifact) => artifact.kind === "PROCESSED_3MF") ?? null,
      printReady: product.artifacts.find((artifact) => artifact.kind === "PRINT_READY") ?? null,
      latestJob: product.fileJobs[0] ?? null,
      mappingPlateCount: mappingPlateCount(product.mappingDraft?.inspection),
    }),
  }));
}
