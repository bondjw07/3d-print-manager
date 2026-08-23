import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth/mock-auth-provider";
import { getMissingThangsModelsFromCsv } from "@/server/services/thangs-csv-import-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const formData = await request.formData();
  const csv = formData.get("catalogCsv");
  if (!(csv instanceof File) || csv.size === 0) return NextResponse.json({ error: "Upload a Kit Kiln catalog CSV." }, { status: 400 });
  try {
    const models = await getMissingThangsModelsFromCsv(await csv.text());
    return new NextResponse(JSON.stringify({ generatedAt: new Date().toISOString(), models }, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": 'attachment; filename="thangs-enrichment-queue.json"',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to build extraction queue." }, { status: 400 });
  }
}
