import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth/mock-auth-provider";
import { importEnrichedThangsProductsFromCsv } from "@/server/services/thangs-csv-import-service";

export const runtime = "nodejs";
const headers = ["creator","title","thangs_model_id","thangs_url","short_description","full_description","category","tags","image_urls_json"];
const cell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json() as { row?: Record<string, string>; creatorUrl?: string };
  if (!body.row || !body.creatorUrl) return NextResponse.json({ error: "Missing import row." }, { status: 400 });
  const csv = `${headers.join(",")}\n${headers.map((header) => cell(body.row?.[header])).join(",")}`;
  try { return NextResponse.json(await importEnrichedThangsProductsFromCsv({ csv, creatorUrl: body.creatorUrl })); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Import failed." }, { status: 400 }); }
}
