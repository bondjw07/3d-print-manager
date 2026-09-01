import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/server/auth/mock-auth-provider";
import { enqueueProductFileJob } from "@/server/jobs/product-file-job-service";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { productId?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const productId = typeof body.productId === "string" ? body.productId.trim() : "";
  if (!productId) return NextResponse.json({ error: "Select a Product." }, { status: 400 });
  const eligible = await prisma.product.findFirst({
    where: { id: productId, importSourceCreatorName: { not: null }, artifacts: { some: { kind: "PRINT_READY" } } },
    select: { id: true },
  });
  if (!eligible) return NextResponse.json({ error: "Product is no longer eligible to publish." }, { status: 400 });
  try {
    const job = await enqueueProductFileJob({ productId, kind: "BAMBUDDY_PUBLISH", phase: "Queued for BamBuddy publishing" });
    return NextResponse.json({ productId, jobId: job.id, status: job.status }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to queue publish." }, { status: 400 });
  }
}
