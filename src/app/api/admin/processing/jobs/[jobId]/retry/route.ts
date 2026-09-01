import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth/mock-auth-provider";
import { retryProductFileJob } from "@/server/jobs/product-file-job-service";

export async function POST(_request: Request, context: RouteContext<"/api/admin/processing/jobs/[jobId]/retry">) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { jobId } = await context.params;
    const job = await retryProductFileJob(jobId);
    return NextResponse.json({ jobId: job.id, status: job.status }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to retry the job." }, { status: 400 });
  }
}
