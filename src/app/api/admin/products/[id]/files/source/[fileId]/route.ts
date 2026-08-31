import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/server/auth/mock-auth-provider";
import { privateFileStorage } from "@/server/storage/private-file-storage";

export const runtime = "nodejs";

export async function DELETE(_request: Request, context: RouteContext<"/api/admin/products/[id]/files/source/[fileId]">) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: productId, fileId } = await context.params;
  const sourceFile = await prisma.productSourceFile.findFirst({ where: { id: fileId, productId } });
  if (!sourceFile) return NextResponse.json({ error: "File not found" }, { status: 404 });

  await prisma.productSourceFile.delete({ where: { id: sourceFile.id } });
  try {
    await privateFileStorage.delete(sourceFile.storageKey);
  } catch (error) {
    console.error("Unable to remove deleted Product source file from storage", error);
  }
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath(`/admin/products/${productId}/files`);
  return NextResponse.json({ deleted: true });
}
