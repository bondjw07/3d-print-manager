import assert from "node:assert/strict";
import test from "node:test";
import { deriveProcessingState } from "./product-processing";

const base = { bambuBuddyFileId: null, importSourceCreatorName: "Kit Kiln", sourceFiles: [], processed: null, printReady: null };

test("derives the numbered happy path", () => {
  assert.equal(deriveProcessingState(base).step, 1);
  const mapped = { ...base, sourceFiles: [{ inspectionStatus: "SUCCEEDED" as const, threeMfCandidateCount: 1 }] };
  assert.equal(deriveProcessingState(mapped).step, 3);
  const processed = { sha256: "processed", downloadName: "Model.3mf" };
  assert.equal(deriveProcessingState({ ...mapped, processed }).step, 4);
  const stale = { sha256: "ready", basedOnProcessedSha256: "old", publishedSha256: null };
  assert.equal(deriveProcessingState({ ...mapped, processed, printReady: stale }).step, 5);
  const current = { ...stale, basedOnProcessedSha256: "processed" };
  assert.equal(deriveProcessingState({ ...mapped, processed, printReady: current }).step, 6);
  assert.equal(deriveProcessingState({ ...mapped, bambuBuddyFileId: "42", processed, printReady: { ...current, publishedSha256: "ready" } }).step, 7);
});

test("attention and errors override normal states", () => {
  assert.equal(deriveProcessingState({ ...base, sourceFiles: [{ inspectionStatus: "SUCCEEDED", threeMfCandidateCount: 0 }] }).key, "ATTENTION");
  assert.equal(deriveProcessingState({ ...base, sourceFiles: [{ inspectionStatus: "SUCCEEDED", threeMfCandidateCount: 2 }] }).key, "ATTENTION");
  assert.equal(deriveProcessingState({ ...base, latestJob: { kind: "SOURCE_INSPECTION", status: "FAILED", error: "bad zip" } }).key, "ERROR");
});

test("cleared BamBuddy errors do not leave a product stuck on an old failed job", () => {
  const sourceFiles = [{ inspectionStatus: "SUCCEEDED" as const, threeMfCandidateCount: 1 }];
  const processed = { sha256: "processed", downloadName: "Model.3mf" };
  const printReady = {
    sha256: "ready",
    basedOnProcessedSha256: "processed",
    publishedSha256: null,
    lastPublishError: null,
  };
  const latestJob = { kind: "BAMBUDDY_PUBLISH" as const, status: "FAILED" as const, error: "old failure" };

  assert.equal(deriveProcessingState({ ...base, sourceFiles, processed, printReady, latestJob }).key, "READY_TO_PUBLISH");
  assert.equal(
    deriveProcessingState({ ...base, sourceFiles, processed, printReady: { ...printReady, lastPublishError: "current failure" }, latestJob }).key,
    "ERROR",
  );
});
