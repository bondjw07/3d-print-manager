import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { normalizeUploadedFileName } from "@/server/files/file-name";
import { withMaterializedSourceCandidate } from "@/server/files/source-candidate-service";
import { inspectThreeMf, transformThreeMf } from "@/server/files/three-mf-processor";
import { inspectSourcePackage, type SourcePackageManifest } from "@/server/files/zip-package-service";
import { privateFileStorage, productArtifactStorageKey, resolvePrivateStoragePath } from "@/server/storage/private-file-storage";
import { getSettings } from "./settings-service";

export async function inspectProductSourceFile(sourceFileId: string) {
  const [sourceFile, settings] = await Promise.all([
    prisma.productSourceFile.findUnique({ where: { id: sourceFileId } }),
    getSettings(),
  ]);
  if (!sourceFile) throw new Error("Product source file not found.");
  await prisma.productSourceFile.update({
    where: { id: sourceFile.id },
    data: { inspectionStatus: "PROCESSING", inspectionError: null },
  });
  try {
    const manifest = await inspectSourcePackage(resolvePrivateStoragePath(sourceFile.storageKey), sourceFile.originalName, {
      expandedMaxBytes: settings.zipExpandedMaxBytes,
      maxEntries: settings.zipMaxEntries,
      maxCompressionRatio: settings.zipMaxCompressionRatio,
    });
    await prisma.productSourceFile.update({
      where: { id: sourceFile.id },
      data: {
        packageManifest: manifest,
        inspectionStatus: "SUCCEEDED",
        threeMfCandidateCount: manifest.threeMfCandidates.length,
        inspectionError: null,
        inspectedAt: new Date(),
      },
    });
    return { sourceFile, manifest };
  } catch (error) {
    await prisma.productSourceFile.update({
      where: { id: sourceFile.id },
      data: {
        inspectionStatus: "FAILED",
        inspectionError: error instanceof Error ? error.message : "Source inspection failed.",
        inspectedAt: new Date(),
      },
    });
    throw error;
  }
}

export function mappingFingerprint(mappings: Array<{ id: string; updatedAt: Date }>) {
  return createHash("sha256")
    .update(mappings.map((mapping) => `${mapping.id}:${mapping.updatedAt.toISOString()}`).sort().join("|"))
    .digest("hex");
}

export async function inspectProductMapping(input: { productId: string; sourceFileId: string; entryPath: string | null }) {
  const [sourceFile, reference, mappings, settings] = await Promise.all([
    prisma.productSourceFile.findFirst({ where: { id: input.sourceFileId, productId: input.productId } }),
    prisma.applicationFile.findUnique({ where: { kind: "P2S_REFERENCE" } }),
    prisma.bambuBuddyFilamentMapping.findMany({ orderBy: [{ materialType: "asc" }, { colorName: "asc" }] }),
    getSettings(),
  ]);
  if (!sourceFile) throw new Error("Product source file not found.");
  if (!reference) throw new Error("Configure a P2S reference before processing Product files.");
  const inspection = await withMaterializedSourceCandidate({
    sourceFile,
    entryPath: input.entryPath,
    maxBytes: settings.fileUploadMaxBytes,
    run: (filePath) => inspectThreeMf(filePath, mappings),
  });
  const draft = await prisma.productMappingDraft.upsert({
    where: { productId: input.productId },
    create: {
      productId: input.productId,
      sourceFileId: sourceFile.id,
      entryPath: input.entryPath,
      sourceSha256: sourceFile.sha256,
      referenceSha256: reference.sha256,
      mappingFingerprint: mappingFingerprint(mappings),
      inspection,
    },
    update: {
      sourceFileId: sourceFile.id,
      entryPath: input.entryPath,
      sourceSha256: sourceFile.sha256,
      referenceSha256: reference.sha256,
      mappingFingerprint: mappingFingerprint(mappings),
      inspection,
    },
  });
  return { draft, inspection };
}

export async function generateProcessedThreeMf(input: {
  productId: string;
  sourceFileId: string;
  entryPath: string | null;
  selections: Record<string, string>;
}) {
  const [product, sourceFile, reference, mappings, settings] = await Promise.all([
    prisma.product.findUnique({ where: { id: input.productId }, select: { id: true, publicName: true } }),
    prisma.productSourceFile.findFirst({ where: { id: input.sourceFileId, productId: input.productId } }),
    prisma.applicationFile.findUnique({ where: { kind: "P2S_REFERENCE" } }),
    prisma.bambuBuddyFilamentMapping.findMany(),
    getSettings(),
  ]);
  if (!product || !sourceFile) throw new Error("Product source file not found.");
  if (!reference?.extractedSettings || typeof reference.extractedSettings !== "object" || Array.isArray(reference.extractedSettings)) {
    throw new Error("Configure a valid P2S reference before processing.");
  }
  return withMaterializedSourceCandidate({
    sourceFile,
    entryPath: input.entryPath,
    maxBytes: settings.fileUploadMaxBytes,
    run: async (inputPath) => {
      const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "pmp-output-"));
      const outputPath = path.join(tempDirectory, "processed.3mf");
      try {
        const summary = await transformThreeMf(inputPath, outputPath, {
          mappings,
          selections: input.selections,
          referenceSettings: reference.extractedSettings as Record<string, unknown>,
        });
        const downloadName = normalizeUploadedFileName(`${product.publicName}-P2S-processed.3mf`);
        const storageKey = productArtifactStorageKey(product.id, "processed", downloadName);
        const stored = await privateFileStorage.saveFile(storageKey, outputPath, settings.fileUploadMaxBytes);
        const previous = await prisma.productArtifact.findUnique({ where: { productId_kind: { productId: input.productId, kind: "PROCESSED_3MF" } } });
        try {
          const artifact = await prisma.productArtifact.upsert({
            where: { productId_kind: { productId: input.productId, kind: "PROCESSED_3MF" } },
            create: { productId: input.productId, kind: "PROCESSED_3MF", storageKey, downloadName, mediaType: "model/3mf", sizeBytes: stored.sizeBytes, sha256: stored.sha256, sourceFileId: input.sourceFileId, sourceArchiveEntryPath: input.entryPath },
            update: { storageKey, downloadName, mediaType: "model/3mf", sizeBytes: stored.sizeBytes, sha256: stored.sha256, sourceFileId: input.sourceFileId, sourceArchiveEntryPath: input.entryPath },
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
}

export function singleCandidateFromManifest(manifest: SourcePackageManifest) {
  return manifest.threeMfCandidates.length === 1 ? manifest.threeMfCandidates[0] : null;
}
