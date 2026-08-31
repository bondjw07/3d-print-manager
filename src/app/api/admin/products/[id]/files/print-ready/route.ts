import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/server/auth/mock-auth-provider";
import { normalizeUploadedFileName } from "@/server/files/file-name";
import { readThreeMfEntries } from "@/server/files/three-mf-archive";
import { PROJECT_SETTINGS_PATH } from "@/server/files/three-mf-processor";
import { getSettings } from "@/server/services/settings-service";
import { privateFileStorage, productArtifactStorageKey, resolvePrivateStoragePath } from "@/server/storage/private-file-storage";

export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext<"/api/admin/products/[id]/files/print-ready">) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: productId } = await context.params;
  if (!request.body) return NextResponse.json({ error: "File body is required" }, { status: 400 });
  let originalName: string;
  try {
    originalName = normalizeUploadedFileName(new URL(request.url).searchParams.get("fileName") ?? "");
    if (!originalName.toLowerCase().endsWith(".gcode.3mf")) throw new Error("Print-ready files must use the .gcode.3mf extension.");
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid file name" }, { status: 400 });
  }
  const [product, settings, processed, previous] = await Promise.all([
    prisma.product.findUnique({ where: { id: productId }, select: { id: true } }),
    getSettings(),
    prisma.productArtifact.findUnique({ where: { productId_kind: { productId, kind: "PROCESSED_3MF" } } }),
    prisma.productArtifact.findUnique({ where: { productId_kind: { productId, kind: "PRINT_READY" } } }),
  ]);
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
  if (!processed) return NextResponse.json({ error: "Generate a processed P2S 3MF before uploading its sliced file." }, { status: 400 });
  const contentLength = request.headers.get("content-length");
  if (contentLength && BigInt(contentLength) > settings.fileUploadMaxBytes) return NextResponse.json({ error: "File exceeds the configured upload limit." }, { status: 413 });

  const storageKey = productArtifactStorageKey(productId, "print-ready", originalName);
  try {
    const stored = await privateFileStorage.saveWebStream(storageKey, request.body, settings.fileUploadMaxBytes);
    try {
      await readThreeMfEntries(resolvePrivateStoragePath(storageKey), [PROJECT_SETTINGS_PATH]);
    } catch (error) {
      await privateFileStorage.delete(storageKey);
      throw new Error(`Invalid print-ready 3MF: ${error instanceof Error ? error.message : "archive could not be read"}`);
    }
    try {
      const artifact = await prisma.productArtifact.upsert({
        where: { productId_kind: { productId, kind: "PRINT_READY" } },
        create: {
          productId,
          kind: "PRINT_READY",
          storageKey,
          downloadName: originalName,
          mediaType: request.headers.get("content-type")?.slice(0, 255) || "application/octet-stream",
          sizeBytes: stored.sizeBytes,
          sha256: stored.sha256,
          basedOnProcessedSha256: processed.sha256,
        },
        update: {
          storageKey,
          downloadName: originalName,
          mediaType: request.headers.get("content-type")?.slice(0, 255) || "application/octet-stream",
          sizeBytes: stored.sizeBytes,
          sha256: stored.sha256,
          basedOnProcessedSha256: processed.sha256,
          lastPublishError: null,
        },
      });
      if (previous?.storageKey && previous.storageKey !== storageKey) {
        try { await privateFileStorage.delete(previous.storageKey); } catch (error) { console.error("Unable to remove replaced print-ready file", error); }
      }
      revalidatePath(`/admin/products/${productId}`);
      revalidatePath(`/admin/products/${productId}/files`);
      return NextResponse.json({ artifact: { ...artifact, sizeBytes: artifact.sizeBytes.toString() } });
    } catch (error) {
      await privateFileStorage.delete(storageKey);
      throw error;
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to store print-ready file." }, { status: 400 });
  }
}
