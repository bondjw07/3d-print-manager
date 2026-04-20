import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { localProductImageStorage } from "@/server/storage/local-storage-service";
import { getSessionUser } from "@/server/auth/mock-auth-provider";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const productId = String(formData.get("productId") ?? "");
  const altText = String(formData.get("altText") ?? "").trim();
  const file = formData.get("file");

  if (!productId || !(file instanceof File)) {
    return NextResponse.json({ error: "productId and file are required" }, { status: 400 });
  }

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const { imagePath } = await localProductImageStorage.saveProductImage(file);
  const sortOrder = await prisma.productImage.count({ where: { productId } });
  const existingPrimary = await prisma.productImage.findFirst({ where: { productId, isPrimary: true } });

  const image = await prisma.productImage.create({
    data: {
      productId,
      imagePath,
      altText: altText || null,
      sortOrder,
      isPrimary: !existingPrimary,
    },
  });

  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/admin/products");
  revalidatePath("/catalog");

  return NextResponse.json({ image });
}
