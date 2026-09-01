import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/server/auth/mock-auth-provider";
import { enqueueProductFileJob } from "@/server/jobs/product-file-job-service";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { productIds?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const productIds = Array.isArray(body.productIds) ? Array.from(new Set(body.productIds.filter((id): id is string => typeof id === "string" && Boolean(id)))).slice(0, 100) : [];
  if (!productIds.length) return NextResponse.json({ error: "Select at least one Product." }, { status: 400 });
  const eligible = await prisma.product.findMany({
    where: { id: { in: productIds }, importSourceCreatorName: { not: null }, artifacts: { some: { kind: "PRINT_READY" } } },
    select: { id: true },
  });
  const eligibleIds = new Set(eligible.map((product) => product.id));
  const results = await Promise.allSettled(productIds.map(async (productId) => {
    if (!eligibleIds.has(productId)) throw new Error("Product is no longer eligible to publish.");
    return enqueueProductFileJob({ productId, kind: "BAMBUDDY_PUBLISH", phase: "Queued for BamBuddy publishing" });
  }));
  return NextResponse.json({
    results: results.map((result, index) => result.status === "fulfilled"
      ? { productId: productIds[index], jobId: result.value.id, status: result.value.status }
      : { productId: productIds[index], status: "FAILED", error: result.reason instanceof Error ? result.reason.message : "Unable to queue publish." }),
  }, { status: 202 });
}
