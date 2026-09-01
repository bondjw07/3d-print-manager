import { Prisma, type ProductFileJob, type ProductFileJobKind } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export async function enqueueProductFileJob(input: {
  productId: string;
  sourceFileId?: string | null;
  kind: ProductFileJobKind;
  payload?: Prisma.InputJsonValue;
  phase?: string;
}) {
  try {
    return await prisma.productFileJob.create({
      data: {
        productId: input.productId,
        sourceFileId: input.sourceFileId ?? null,
        kind: input.kind,
        phase: input.phase ?? null,
        payload: input.payload,
      },
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const active = await prisma.productFileJob.findFirst({
      where: {
        kind: input.kind,
        status: { in: ["QUEUED", "RUNNING"] },
        ...(input.kind === "SOURCE_INSPECTION" && input.sourceFileId ? { sourceFileId: input.sourceFileId } : { productId: input.productId }),
      },
      orderBy: { createdAt: "desc" },
    });
    if (!active) throw error;
    return active;
  }
}

export async function claimNextProductFileJob(workerId: string, leaseMilliseconds = 10 * 60 * 1000) {
  const leaseExpiresAt = new Date(Date.now() + leaseMilliseconds);
  const jobs = await prisma.$queryRaw<ProductFileJob[]>`
    WITH candidate AS (
      SELECT "id"
      FROM "ProductFileJob"
      WHERE (
        ("status" = 'QUEUED' AND "availableAt" <= NOW())
        OR ("status" = 'RUNNING' AND "leaseExpiresAt" < NOW())
      )
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE "ProductFileJob" AS job
    SET
      "status" = 'RUNNING',
      "leaseOwner" = ${workerId},
      "leaseExpiresAt" = ${leaseExpiresAt},
      "startedAt" = COALESCE(job."startedAt", NOW()),
      "attempts" = job."attempts" + 1,
      "error" = NULL,
      "updatedAt" = NOW()
    FROM candidate
    WHERE job."id" = candidate."id"
    RETURNING job.*
  `;
  return jobs[0] ?? null;
}

export function updateProductFileJob(jobId: string, data: { phase?: string; progress?: number | null }) {
  return prisma.productFileJob.update({ where: { id: jobId }, data });
}

export function completeProductFileJob(jobId: string, result?: Prisma.InputJsonValue) {
  return prisma.productFileJob.update({
    where: { id: jobId },
    data: {
      status: "SUCCEEDED",
      phase: "Complete",
      progress: 100,
      result,
      error: null,
      completedAt: new Date(),
      leaseOwner: null,
      leaseExpiresAt: null,
    },
  });
}

export function failProductFileJob(jobId: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Processing failed.";
  return prisma.productFileJob.update({
    where: { id: jobId },
    data: {
      status: "FAILED",
      phase: "Failed",
      progress: null,
      error: message.slice(0, 4000),
      completedAt: new Date(),
      leaseOwner: null,
      leaseExpiresAt: null,
    },
  });
}

export async function retryProductFileJob(jobId: string) {
  const failed = await prisma.productFileJob.findUnique({ where: { id: jobId } });
  if (!failed || failed.status !== "FAILED") throw new Error("The failed job was not found.");
  return enqueueProductFileJob({
    productId: failed.productId,
    sourceFileId: failed.sourceFileId,
    kind: failed.kind,
    payload: failed.payload ?? undefined,
    phase: "Queued for retry",
  });
}
