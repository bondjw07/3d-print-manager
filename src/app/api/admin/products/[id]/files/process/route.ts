import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/server/auth/mock-auth-provider";
import { normalizeUploadedFileName } from "@/server/files/file-name";
import { transformThreeMf } from "@/server/files/three-mf-processor";
import { withMaterializedSourceCandidate } from "@/server/files/source-candidate-service";
import { getSettings } from "@/server/services/settings-service";
import { privateFileStorage, productArtifactStorageKey } from "@/server/storage/private-file-storage";

export const runtime = "nodejs";

export async function POST(request: Request, context: RouteContext<"/api/admin/products/[id]/files/process">) {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: productId } = await context.params;
  let payload: { sourceFileId?: unknown; entryPath?: unknown; selections?: unknown };
  try { payload = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const sourceFileId = typeof payload.sourceFileId === "string" ? payload.sourceFileId : "";
  const entryPath = typeof payload.entryPath === "string" ? payload.entryPath : null;
  const selections = payload.selections && typeof payload.selections === "object" && !Array.isArray(payload.selections)
    ? Object.fromEntries(Object.entries(payload.selections).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
    : null;
  if (!sourceFileId || !selections) return NextResponse.json({ error: "Source file and reviewed mappings are required." }, { status: 400 });

  const [product, sourceFile, reference, mappings, settings] = await Promise.all([
    prisma.product.findUnique({ where: { id: productId }, select: { id: true, publicName: true } }),
    prisma.productSourceFile.findFirst({ where: { id: sourceFileId, productId } }),
    prisma.applicationFile.findUnique({ where: { kind: "P2S_REFERENCE" } }),
    prisma.bambuBuddyFilamentMapping.findMany(),
    getSettings(),
  ]);
  if (!product || !sourceFile) return NextResponse.json({ error: "Product source file not found." }, { status: 404 });
  if (!reference?.extractedSettings || typeof reference.extractedSettings !== "object" || Array.isArray(reference.extractedSettings)) {
    return NextResponse.json({ error: "Configure a valid P2S reference before processing." }, { status: 400 });
  }

  try {
    const result = await withMaterializedSourceCandidate({
      sourceFile,
      entryPath,
      maxBytes: settings.fileUploadMaxBytes,
      run: async (inputPath) => {
        const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "pmp-output-"));
        const outputPath = path.join(tempDirectory, "processed.3mf");
        try {
          const summary = await transformThreeMf(inputPath, outputPath, {
            mappings,
            selections,
            referenceSettings: reference.extractedSettings as Record<string, unknown>,
          });
          const downloadName = normalizeUploadedFileName(`${product.publicName}-P2S-processed.3mf`);
          const storageKey = productArtifactStorageKey(product.id, "processed", downloadName);
          const stored = await privateFileStorage.saveFile(storageKey, outputPath, settings.fileUploadMaxBytes);
          const previous = await prisma.productArtifact.findUnique({ where: { productId_kind: { productId, kind: "PROCESSED_3MF" } } });
          try {
            const artifact = await prisma.productArtifact.upsert({
              where: { productId_kind: { productId, kind: "PROCESSED_3MF" } },
              create: {
                productId,
                kind: "PROCESSED_3MF",
                storageKey,
                downloadName,
                mediaType: "model/3mf",
                sizeBytes: stored.sizeBytes,
                sha256: stored.sha256,
                sourceFileId,
                sourceArchiveEntryPath: entryPath,
              },
              update: {
                storageKey,
                downloadName,
                mediaType: "model/3mf",
                sizeBytes: stored.sizeBytes,
                sha256: stored.sha256,
                sourceFileId,
                sourceArchiveEntryPath: entryPath,
              },
            });
            if (previous?.storageKey && previous.storageKey !== storageKey) {
              try { await privateFileStorage.delete(previous.storageKey); } catch (error) { console.error("Unable to remove replaced processed 3MF", error); }
            }
            return { artifact, summary };
          } catch (error) {
            await privateFileStorage.delete(storageKey);
            throw error;
          }
        } finally {
          await rm(tempDirectory, { recursive: true, force: true });
        }
      },
    });
    revalidatePath(`/admin/products/${productId}`);
    revalidatePath(`/admin/products/${productId}/files`);
    return NextResponse.json({ artifactId: result.artifact.id, sha256: result.artifact.sha256, summary: result.summary });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to generate processed 3MF." }, { status: 400 });
  }
}
