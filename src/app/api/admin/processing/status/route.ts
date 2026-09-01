import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth/mock-auth-provider";
import { getProcessingStatuses } from "@/server/services/processing-queue-service";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ids = Array.from(new Set(new URL(request.url).searchParams.getAll("id").filter(Boolean))).slice(0, 100);
  return NextResponse.json({ statuses: await getProcessingStatuses(ids) });
}
