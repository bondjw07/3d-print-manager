import { randomUUID } from "node:crypto";
import type { ProductFileJob } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { publishProductPrintReadyFile } from "@/server/bambuddy/bambuddy-publish-service";
import {
  generateProcessedThreeMf,
  inspectProductMapping,
  inspectProductSourceFile,
  singleCandidateFromManifest,
} from "@/server/services/product-file-processing-service";
import {
  claimNextProductFileJob,
  completeProductFileJob,
  enqueueProductFileJob,
  failProductFileJob,
  productFileJobHeartbeatMilliseconds,
  renewProductFileJobLease,
  updateProductFileJob,
} from "./product-file-job-service";

type JobPayload = {
  sourceFileId?: unknown;
  entryPath?: unknown;
  selections?: unknown;
};

function payloadFor(job: ProductFileJob) {
  return job.payload && typeof job.payload === "object" && !Array.isArray(job.payload) ? job.payload as JobPayload : {};
}

function sourceInput(job: ProductFileJob) {
  const payload = payloadFor(job);
  const sourceFileId = job.sourceFileId ?? (typeof payload.sourceFileId === "string" ? payload.sourceFileId : "");
  const entryPath = typeof payload.entryPath === "string" ? payload.entryPath : null;
  if (!sourceFileId) throw new Error("The job has no source file.");
  return { sourceFileId, entryPath };
}

function selectionsFrom(job: ProductFileJob) {
  const selections = payloadFor(job).selections;
  if (!selections || typeof selections !== "object" || Array.isArray(selections)) throw new Error("Reviewed mappings are missing from the job.");
  return Object.fromEntries(Object.entries(selections).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

export async function processClaimedProductFileJob(job: ProductFileJob) {
  const heartbeat = job.leaseOwner ? setInterval(() => {
    void renewProductFileJobLease(job.id, job.leaseOwner!).then((updated) => {
      if (!updated) console.error(`[PMP file worker] Lost lease for job ${job.id}.`);
    }).catch((error) => {
      console.error(`[PMP file worker] Unable to renew lease for job ${job.id}.`, error);
    });
  }, productFileJobHeartbeatMilliseconds) : null;
  heartbeat?.unref();
  try {
    if (job.kind === "SOURCE_INSPECTION") {
      await updateProductFileJob(job.id, { phase: "Inspecting archive" });
      const sourceFileId = job.sourceFileId ?? sourceInput(job).sourceFileId;
      const { manifest } = await inspectProductSourceFile(sourceFileId);
      const candidate = singleCandidateFromManifest(manifest);
      if (candidate) {
        await enqueueProductFileJob({
          productId: job.productId,
          sourceFileId,
          kind: "MAPPING_INSPECTION",
          phase: "Queued for mapping inspection",
          payload: { sourceFileId, entryPath: candidate.entryPath },
        });
      }
      await completeProductFileJob(job.id, { candidateCount: manifest.threeMfCandidates.length });
      return;
    }

    if (job.kind === "MAPPING_INSPECTION") {
      await updateProductFileJob(job.id, { phase: "Inspecting color mappings" });
      const input = sourceInput(job);
      const { inspection } = await inspectProductMapping({ productId: job.productId, ...input });
      await completeProductFileJob(job.id, { plateCount: inspection.plates.length, filamentCount: inspection.filamentCount });
      return;
    }

    if (job.kind === "PROCESSED_GENERATION") {
      await updateProductFileJob(job.id, { phase: "Applying P2S template and mappings" });
      const input = sourceInput(job);
      const result = await generateProcessedThreeMf({ productId: job.productId, ...input, selections: selectionsFrom(job) });
      await completeProductFileJob(job.id, { artifactId: result.artifact.id, sha256: result.artifact.sha256 });
      return;
    }

    await updateProductFileJob(job.id, { phase: "Publishing to BamBuddy" });
    const result = await publishProductPrintReadyFile(job.productId, async (phase) => {
      await updateProductFileJob(job.id, { phase });
    });
    await completeProductFileJob(job.id, { fileId: result.fileId, fileName: result.fileName });
  } catch (error) {
    try {
      await failProductFileJob(job.id, error);
    } catch (persistenceError) {
      // The source or product may have been deleted while its job was running.
      // Keep the worker lane alive even when the cascaded job row is already gone.
      console.error(`Unable to persist failure for product file job ${job.id}.`, persistenceError);
    }
  } finally {
    if (heartbeat) clearInterval(heartbeat);
  }
}

export async function runOneProductFileJob(workerId = `pmp-${randomUUID()}`) {
  const job = await claimNextProductFileJob(workerId);
  if (!job) return false;
  const startedAt = Date.now();
  console.log(`[PMP file worker] Claimed ${job.kind} job ${job.id} for Product ${job.productId} (attempt ${job.attempts}).`);
  await processClaimedProductFileJob(job);
  const finished = await prisma.productFileJob.findUnique({
    where: { id: job.id },
    select: { status: true, phase: true, error: true },
  });
  const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  if (!finished) console.log(`[PMP file worker] Job ${job.id} was removed after ${durationSeconds}s.`);
  else if (finished.status === "FAILED") console.error(`[PMP file worker] Job ${job.id} failed after ${durationSeconds}s: ${finished.error ?? "Unknown error"}`);
  else console.log(`[PMP file worker] Job ${job.id} ${finished.status.toLowerCase()} after ${durationSeconds}s (${finished.phase ?? "no phase"}).`);
  return true;
}
