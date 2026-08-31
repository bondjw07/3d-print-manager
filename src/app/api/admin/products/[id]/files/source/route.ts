import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/server/auth/mock-auth-provider";
import { normalizeUploadedFileName } from "@/server/files/file-name";
import { inspectSourcePackage } from "@/server/files/zip-package-service";
import {
  privateFileStorage,
  productSourceStorageKey,
  resolvePrivateStoragePath,
} from "@/server/storage/private-file-storage";
import { getSettings } from "@/server/services/settings-service";

export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext<"/api/admin/products/[id]/files/source">) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: productId } = await context.params;
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
  if (!request.body) return NextResponse.json({ error: "File body is required" }, { status: 400 });

  let originalName: string;
  try {
    originalName = normalizeUploadedFileName(new URL(request.url).searchParams.get("fileName") ?? "");
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid file name" }, { status: 400 });
  }

  const settings = await getSettings();
  const contentLength = request.headers.get("content-length");
  if (contentLength && BigInt(contentLength) > settings.fileUploadMaxBytes) {
    return NextResponse.json({ error: "File exceeds the configured upload limit." }, { status: 413 });
  }

  const sourceFileId = randomUUID();
  const storageKey = productSourceStorageKey(productId, sourceFileId, originalName);
  try {
    const stored = await privateFileStorage.saveWebStream(storageKey, request.body, settings.fileUploadMaxBytes);
    let packageManifest;
    try {
      packageManifest = await inspectSourcePackage(resolvePrivateStoragePath(storageKey), originalName, {
        expandedMaxBytes: settings.zipExpandedMaxBytes,
        maxEntries: settings.zipMaxEntries,
        maxCompressionRatio: settings.zipMaxCompressionRatio,
      });
    } catch (error) {
      await privateFileStorage.delete(storageKey);
      throw error;
    }

    try {
      const sourceFile = await prisma.productSourceFile.create({
        data: {
          id: sourceFileId,
          productId,
          originalName,
          storageKey,
          mediaType: request.headers.get("content-type")?.slice(0, 255) || null,
          sizeBytes: stored.sizeBytes,
          sha256: stored.sha256,
          packageManifest,
        },
      });
      revalidatePath(`/admin/products/${productId}`);
      revalidatePath(`/admin/products/${productId}/files`);
      return NextResponse.json({
        sourceFile: {
          ...sourceFile,
          sizeBytes: sourceFile.sizeBytes.toString(),
        },
      });
    } catch (error) {
      await privateFileStorage.delete(storageKey);
      throw error;
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to store file." },
      { status: error instanceof Error && error.message.includes("configured upload limit") ? 413 : 400 },
    );
  }
}
