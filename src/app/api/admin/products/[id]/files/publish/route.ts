import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth/mock-auth-provider";
import { enqueueProductFileJob } from "@/server/jobs/product-file-job-service";

export const runtime = "nodejs";

export async function POST(_request: Request, context: RouteContext<"/api/admin/products/[id]/files/publish">) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: productId } = await context.params;
  try {
    const job = await enqueueProductFileJob({ productId, kind: "BAMBUDDY_PUBLISH", phase: "Queued for BamBuddy publishing" });
    return NextResponse.json({ jobId: job.id, status: job.status }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "BamBuddy publish failed." }, { status: 400 });
  }
}
