import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/server/auth/mock-auth-provider";
import { publishProductPrintReadyFile } from "@/server/bambuddy/bambuddy-publish-service";

export const runtime = "nodejs";

export async function POST(_request: Request, context: RouteContext<"/api/admin/products/[id]/files/publish">) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: productId } = await context.params;
  try {
    const result = await publishProductPrintReadyFile(productId);
    revalidatePath(`/admin/products/${productId}`);
    revalidatePath(`/admin/products/${productId}/files`);
    revalidatePath("/admin/products");
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "BamBuddy publish failed." }, { status: 400 });
  }
}
