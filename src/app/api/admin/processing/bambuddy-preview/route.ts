import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/server/auth/mock-auth-provider";
import { getBambuBuddyCategoryTagMappings, getBambuBuddyTagForProductCategory } from "@/server/services/bambuddy-category-tag-mapping-service";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { productIds?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const productIds = Array.isArray(body.productIds) ? Array.from(new Set(body.productIds.filter((id): id is string => typeof id === "string" && Boolean(id)))).slice(0, 100) : [];
  if (!productIds.length) return NextResponse.json({ error: "Select at least one Product." }, { status: 400 });
  const [products, categoryMappings] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, publicName: true, category: true, tags: true, importSourceCreatorName: true, artifacts: { where: { kind: { in: ["PROCESSED_3MF", "PRINT_READY"] } }, select: { kind: true, downloadName: true, sha256: true, basedOnProcessedSha256: true } } },
    }),
    getBambuBuddyCategoryTagMappings(),
  ]);
  const rows = products.map((product) => {
    const categoryTag = getBambuBuddyTagForProductCategory(product.category, categoryMappings);
    const printReady = product.artifacts.find((artifact) => artifact.kind === "PRINT_READY");
    const processed = product.artifacts.find((artifact) => artifact.kind === "PROCESSED_3MF");
    return {
      id: product.id,
      publicName: product.publicName,
      creatorName: product.importSourceCreatorName,
      printReadyName: printReady?.downloadName ?? null,
      tags: categoryTag ? [...product.tags, categoryTag] : product.tags,
      categoryTag,
      valid: Boolean(printReady && processed && printReady.basedOnProcessedSha256 === processed.sha256 && product.importSourceCreatorName?.trim()),
    };
  });
  return NextResponse.json({ rows });
}
