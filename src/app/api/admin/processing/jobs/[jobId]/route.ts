import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/server/auth/mock-auth-provider";

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { jobId } = await context.params;
  const job = await prisma.productFileJob.findUnique({
    where: { id: jobId },
    select: { id: true, productId: true, kind: true, status: true, phase: true, progress: true, error: true },
  });
  if (!job) return NextResponse.json({ error: "Processing job not found." }, { status: 404 });
  return NextResponse.json({ job }, { headers: { "Cache-Control": "no-store" } });
}
