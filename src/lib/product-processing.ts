export const numberedProcessingStates = [
  "NEEDS_SOURCE",
  "PROCESSING_SOURCE",
  "NEEDS_MAPPING_REVIEW",
  "PROCESSED_READY",
  "NEEDS_UPDATED_PRINT_READY",
  "READY_TO_PUBLISH",
  "PUBLISHED",
] as const;

export type NumberedProcessingState = (typeof numberedProcessingStates)[number];
export type ProcessingStateKey = NumberedProcessingState | "PROCESSING" | "ATTENTION" | "ERROR";

export type ProcessingState = {
  key: ProcessingStateKey;
  step: number | null;
  label: string;
  tone: "neutral" | "info" | "warning" | "danger" | "success";
  details: string;
  action: "UPLOAD_SOURCE" | "REVIEW_MAPPING" | "DOWNLOAD_PROCESSED" | "UPLOAD_PRINT_READY" | "PUBLISH" | "RETRY" | "RESOLVE" | "VIEW" | null;
};

type SourceSummary = {
  inspectionStatus: "PENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED";
  threeMfCandidateCount: number | null;
  inspectionError?: string | null;
};

type ArtifactSummary = {
  sha256: string;
  basedOnProcessedSha256?: string | null;
  publishedSha256?: string | null;
  downloadName?: string;
  lastPublishError?: string | null;
};

type JobSummary = {
  kind: "SOURCE_INSPECTION" | "MAPPING_INSPECTION" | "PROCESSED_GENERATION" | "BAMBUDDY_PUBLISH";
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  phase?: string | null;
  error?: string | null;
};

export type ProcessingProductSummary = {
  bambuBuddyFileId: string | null;
  importSourceCreatorName?: string | null;
  sourceFiles: SourceSummary[];
  processed: ArtifactSummary | null;
  printReady: ArtifactSummary | null;
  latestJob?: JobSummary | null;
  mappingPlateCount?: number | null;
};

const jobLabels: Record<JobSummary["kind"], string> = {
  SOURCE_INSPECTION: "Inspecting source archive",
  MAPPING_INSPECTION: "Inspecting color mappings",
  PROCESSED_GENERATION: "Generating processed 3MF",
  BAMBUDDY_PUBLISH: "Publishing to BamBuddy",
};

export function deriveProcessingState(product: ProcessingProductSummary): ProcessingState {
  const latestJob = product.latestJob;
  if (latestJob?.status === "QUEUED" || latestJob?.status === "RUNNING") {
    const label = latestJob.phase?.trim() || jobLabels[latestJob.kind];
    return {
      key: latestJob.kind === "SOURCE_INSPECTION" || latestJob.kind === "MAPPING_INSPECTION" ? "PROCESSING_SOURCE" : "PROCESSING",
      step: latestJob.kind === "SOURCE_INSPECTION" || latestJob.kind === "MAPPING_INSPECTION" ? 2 : null,
      label: latestJob.kind === "SOURCE_INSPECTION" || latestJob.kind === "MAPPING_INSPECTION" ? "Processing Source" : "Processing",
      tone: "info",
      details: latestJob.status === "QUEUED" ? `Queued · ${label}` : label,
      action: "VIEW",
    };
  }
  if (latestJob?.status === "FAILED" && !(latestJob.kind === "BAMBUDDY_PUBLISH" && !product.printReady?.lastPublishError)) {
    return {
      key: "ERROR",
      step: null,
      label: `${jobLabels[latestJob.kind]} Failed`,
      tone: "danger",
      details: latestJob.error?.trim() || "The last processing attempt failed.",
      action: "RETRY",
    };
  }

  if (product.sourceFiles.length === 0) {
    return { key: "NEEDS_SOURCE", step: 1, label: "Needs Source Files", tone: "neutral", details: "No source archive uploaded", action: "UPLOAD_SOURCE" };
  }

  const failedSource = product.sourceFiles.find((source) => source.inspectionStatus === "FAILED");
  if (failedSource && !product.processed) {
    return { key: "ERROR", step: null, label: "Source Processing Failed", tone: "danger", details: failedSource.inspectionError || "The source archive could not be inspected.", action: "RETRY" };
  }
  if (product.sourceFiles.some((source) => source.inspectionStatus === "PENDING" || source.inspectionStatus === "PROCESSING")) {
    return { key: "PROCESSING_SOURCE", step: 2, label: "Processing Source", tone: "info", details: "Archive uploaded · Identifying 3MF", action: "VIEW" };
  }

  if (!product.processed) {
    const candidateCount = product.sourceFiles.reduce((total, source) => total + (source.threeMfCandidateCount ?? 0), 0);
    if (candidateCount === 0) {
      return { key: "ATTENTION", step: null, label: "No 3MF Found", tone: "warning", details: "No usable 3MF candidates were found", action: "RESOLVE" };
    }
    if (candidateCount > 1) {
      return { key: "ATTENTION", step: null, label: "Multiple 3MF Files Found", tone: "warning", details: `${candidateCount} possible 3MF files found`, action: "RESOLVE" };
    }
    return {
      key: "NEEDS_MAPPING_REVIEW",
      step: 3,
      label: "Needs Mapping Review",
      tone: "warning",
      details: product.mappingPlateCount == null ? "1 source 3MF identified" : `${product.mappingPlateCount} plate mapping${product.mappingPlateCount === 1 ? "" : "s"} detected`,
      action: "REVIEW_MAPPING",
    };
  }

  if (!product.printReady) {
    return { key: "PROCESSED_READY", step: 4, label: "Processed 3MF Ready", tone: "info", details: "Processed 3MF generated · Waiting for Bambu Studio output", action: "DOWNLOAD_PROCESSED" };
  }
  if (product.printReady.basedOnProcessedSha256 !== product.processed.sha256) {
    return { key: "NEEDS_UPDATED_PRINT_READY", step: 5, label: "Needs Updated Print-Ready File", tone: "warning", details: "The sliced file is based on an older processed 3MF", action: "UPLOAD_PRINT_READY" };
  }
  const publishedIsCurrent = Boolean(
    product.bambuBuddyFileId?.trim() && product.printReady.publishedSha256 === product.printReady.sha256,
  );
  if (!publishedIsCurrent) {
    if (!product.importSourceCreatorName?.trim()) {
      return { key: "ATTENTION", step: null, label: "Creator Required", tone: "warning", details: "Assign a creator before publishing to BamBuddy", action: "RESOLVE" };
    }
    if (product.printReady.lastPublishError) {
      return { key: "ERROR", step: null, label: "BamBuddy Publish Failed", tone: "danger", details: product.printReady.lastPublishError, action: "RETRY" };
    }
    return { key: "READY_TO_PUBLISH", step: 6, label: "Ready to Publish", tone: "info", details: "Print-ready file uploaded", action: "PUBLISH" };
  }
  return { key: "PUBLISHED", step: 7, label: "Published", tone: "success", details: `BamBuddy File ID: ${product.bambuBuddyFileId}`, action: "VIEW" };
}

export function isCompleteByBambuBuddyId(product: Pick<ProcessingProductSummary, "bambuBuddyFileId">) {
  return Boolean(product.bambuBuddyFileId?.trim());
}
