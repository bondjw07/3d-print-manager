import { Prisma, type ProductFileJob, type ProductFileJobKind } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export const productFileJobLeaseMilliseconds = 10 * 60 * 1000;
export const productFileJobHeartbeatMilliseconds = 60 * 1000;

// Prisma DateTime columns are stored as UTC wall-clock values in PostgreSQL
// TIMESTAMP columns. Keep raw SQL on that same convention even when the
// database server's session timezone is not UTC.
const databaseUtcNow = Prisma.sql`(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')`;

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

export async function claimNextProductFileJob(workerId: string, leaseMilliseconds = productFileJobLeaseMilliseconds) {
  const jobs = await prisma.$queryRaw<ProductFileJob[]>`
    WITH candidate AS (
      SELECT "id"
      FROM "ProductFileJob"
      WHERE (
        ("status" = 'QUEUED' AND "availableAt" <= ${databaseUtcNow})
        OR ("status" = 'RUNNING' AND "leaseExpiresAt" < ${databaseUtcNow})
      )
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE "ProductFileJob" AS job
    SET
      "status" = 'RUNNING',
      "leaseOwner" = ${workerId},
      "leaseExpiresAt" = ${databaseUtcNow} + (${leaseMilliseconds}::double precision * INTERVAL '1 millisecond'),
      "startedAt" = COALESCE(job."startedAt", ${databaseUtcNow}),
      "attempts" = job."attempts" + 1,
      "error" = NULL,
      "updatedAt" = ${databaseUtcNow}
    FROM candidate
    WHERE job."id" = candidate."id"
    RETURNING job.*
  `;
  return jobs[0] ?? null;
}

export function renewProductFileJobLease(
  jobId: string,
  leaseOwner: string,
  leaseMilliseconds = productFileJobLeaseMilliseconds,
) {
  return prisma.$executeRaw`
    UPDATE "ProductFileJob"
    SET
      "leaseExpiresAt" = ${databaseUtcNow} + (${leaseMilliseconds}::double precision * INTERVAL '1 millisecond'),
      "updatedAt" = ${databaseUtcNow}
    WHERE
      "id" = ${jobId}
      AND "status" = 'RUNNING'
      AND "leaseOwner" = ${leaseOwner}
  `;
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
