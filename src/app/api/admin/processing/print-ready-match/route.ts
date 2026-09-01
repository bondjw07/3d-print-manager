import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canonicalExpectedPrintReadyName, canonicalFileName, expectedPrintReadyName } from "@/lib/print-ready-matching";
import { getSessionUser } from "@/server/auth/mock-auth-provider";

type FilePreview = { name?: unknown; size?: unknown };

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { files?: unknown; productId?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  if (!Array.isArray(body.files) || body.files.length > 100) return NextResponse.json({ error: "Choose between 1 and 100 files." }, { status: 400 });
  const files = body.files.filter((item): item is FilePreview => Boolean(item) && typeof item === "object" && !Array.isArray(item));
  const forcedProductId = typeof body.productId === "string" ? body.productId : null;
  const products = await prisma.product.findMany({
    where: forcedProductId ? { id: forcedProductId } : { artifacts: { some: { kind: "PROCESSED_3MF" } } },
    select: {
      id: true,
      publicName: true,
      artifacts: { where: { kind: { in: ["PROCESSED_3MF", "PRINT_READY"] } }, select: { kind: true, downloadName: true } },
    },
  });
  const expected = products.flatMap((product) => {
    const processed = product.artifacts.find((artifact) => artifact.kind === "PROCESSED_3MF");
    if (!processed) return [];
    return [{
      productId: product.id,
      productName: product.publicName,
      expectedName: expectedPrintReadyName(processed.downloadName),
      canonicalName: canonicalExpectedPrintReadyName(processed.downloadName),
      hasExisting: product.artifacts.some((artifact) => artifact.kind === "PRINT_READY"),
    }];
  });
  const canonicalCounts = new Map<string, number>();
  for (const file of files) {
    if (typeof file.name !== "string") continue;
    const canonical = canonicalFileName(file.name);
    canonicalCounts.set(canonical, (canonicalCounts.get(canonical) ?? 0) + 1);
  }
  const provisional = files.map((file, index) => {
    const name = typeof file.name === "string" ? file.name : "";
    const canonical = canonicalFileName(name);
    const candidates = expected.filter((item) => item.canonicalName === canonical);
    return { index, name, size: typeof file.size === "number" ? file.size : 0, canonical, candidates };
  });
  const productCounts = new Map<string, number>();
  for (const item of provisional) if (item.candidates.length === 1) productCounts.set(item.candidates[0].productId, (productCounts.get(item.candidates[0].productId) ?? 0) + 1);
  const matches = provisional.map((item) => {
    const match = item.candidates.length === 1 ? item.candidates[0] : null;
    const duplicate = (canonicalCounts.get(item.canonical) ?? 0) > 1;
    const productConflict = match ? (productCounts.get(match.productId) ?? 0) > 1 : false;
    const validExtension = item.name.toLocaleLowerCase("en-US").endsWith(".gcode.3mf");
    const status = !validExtension ? "INVALID" : duplicate ? "DUPLICATE" : item.candidates.length === 0 ? "UNMATCHED" : item.candidates.length > 1 ? "AMBIGUOUS" : productConflict ? "CONFLICT" : "MATCHED";
    return { ...item, candidates: undefined, status, productId: match?.productId ?? null, productName: match?.productName ?? null, expectedName: match?.expectedName ?? null, hasExisting: match?.hasExisting ?? false };
  });
  return NextResponse.json({ matches });
}
