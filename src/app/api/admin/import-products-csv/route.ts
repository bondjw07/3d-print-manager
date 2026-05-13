import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/server/auth/mock-auth-provider";
import { importProductsFromCsv } from "@/server/services/product-csv-import-service";

export const runtime = "nodejs";

const maxCsvUploadBytes = 12 * 1024 * 1024;

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const importImages = String(formData.get("importImages") ?? "true") !== "false";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "CSV file is required." }, { status: 400 });
  }

  if (file.size <= 0) {
    return NextResponse.json({ error: "CSV file is empty." }, { status: 400 });
  }

  if (file.size > maxCsvUploadBytes) {
    return NextResponse.json(
      { error: `CSV file is too large. Max size is ${Math.floor(maxCsvUploadBytes / (1024 * 1024))} MB.` },
      { status: 400 },
    );
  }

  try {
    const csvContent = await file.text();
    const result = await importProductsFromCsv(csvContent, { importImages });

    revalidatePath("/admin/products");
    revalidatePath("/catalog");
    revalidatePath("/admin");

    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to import products.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
