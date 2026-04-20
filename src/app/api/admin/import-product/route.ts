import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/server/auth/mock-auth-provider";
import { importProductFromSourceUrl } from "@/server/services/product-import-service";

export const runtime = "nodejs";

type ImportRequestBody = {
  sourceUrl?: string;
  importImages?: boolean;
};

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ImportRequestBody;
  try {
    body = (await request.json()) as ImportRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const sourceUrl = String(body.sourceUrl ?? "").trim();
  const importImages = body.importImages !== false;

  if (!sourceUrl) {
    return NextResponse.json({ error: "sourceUrl is required." }, { status: 400 });
  }

  try {
    const result = await importProductFromSourceUrl({
      sourceUrl,
      importImages,
    });

    revalidatePath("/admin/products");
    revalidatePath(`/admin/products/${result.product.id}`);
    revalidatePath("/catalog");
    revalidatePath("/admin");

    return NextResponse.json({
      result: {
        productId: result.product.id,
        source: result.source,
        wasDuplicate: result.wasDuplicate,
        importedImageCount: result.importedImageCount,
        skippedDuplicateImageCount: result.skippedDuplicateImageCount,
        guessedFilamentCount: result.guessedFilamentCount,
        addedFilamentRequirementCount: result.addedFilamentRequirementCount,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
