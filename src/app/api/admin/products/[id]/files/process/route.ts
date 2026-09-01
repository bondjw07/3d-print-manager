import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/server/auth/mock-auth-provider";
import { enqueueProductFileJob } from "@/server/jobs/product-file-job-service";

export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext<"/api/admin/products/[id]/files/process">) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: productId } = await context.params;
  let payload: { sourceFileId?: unknown; entryPath?: unknown; selections?: unknown };
  try { payload = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const sourceFileId = typeof payload.sourceFileId === "string" ? payload.sourceFileId : "";
  const entryPath = typeof payload.entryPath === "string" ? payload.entryPath : null;
  const selections = payload.selections && typeof payload.selections === "object" && !Array.isArray(payload.selections)
    ? Object.fromEntries(Object.entries(payload.selections).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
    : null;
  if (!sourceFileId || !selections) return NextResponse.json({ error: "Source file and reviewed mappings are required." }, { status: 400 });
  const sourceFile = await prisma.productSourceFile.findFirst({ where: { id: sourceFileId, productId } });
  if (!sourceFile) return NextResponse.json({ error: "Product source file not found." }, { status: 404 });

  try {
    const job = await enqueueProductFileJob({
      productId,
      sourceFileId,
      kind: "PROCESSED_GENERATION",
      phase: "Queued for processed 3MF generation",
      payload: { sourceFileId, entryPath, selections },
    });
    return NextResponse.json({ jobId: job.id, status: job.status }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to queue processed 3MF generation." }, { status: 400 });
  }
}
