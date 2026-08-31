import { prisma } from "@/lib/prisma";
import { resolvePrivateStoragePath } from "@/server/storage/private-file-storage";
import { getSettings } from "@/server/services/settings-service";
import { getBambuBuddyApiKey } from "@/server/services/bambuddy-auth-service";
import { updateBambuBuddyProductData } from "@/server/services/product-service";
import {
  BambuBuddyApiError,
  BambuBuddyClient,
  resolveBambuBuddyFolderHierarchy,
  type BambuBuddyFile,
} from "./bambuddy-client";
import { chooseBambuBuddyGcodeFileName } from "./bambuddy-file-name";

function finiteNonNegativeNumber(value: unknown) {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : undefined;
}

function filamentRequirements(file: BambuBuddyFile) {
  const grouped = new Map<string, { materialType: string; hexColor: string; estimatedGramsPerPrint: number }>();
  for (const slot of file.metadata?.filament_slots ?? []) {
    const materialType = typeof slot.type === "string" ? slot.type.trim().toUpperCase() : "";
    const hexColor = typeof slot.color === "string" ? slot.color.trim().toUpperCase() : "";
    const grams = finiteNonNegativeNumber(slot.used_g);
    if (!materialType || !/^#[0-9A-F]{6}$/.test(hexColor) || grams === undefined) continue;
    const key = `${materialType}:${hexColor}`;
    const existing = grouped.get(key);
    grouped.set(key, {
      materialType,
      hexColor,
      estimatedGramsPerPrint: grams + (existing?.estimatedGramsPerPrint ?? 0),
    });
  }
  return [...grouped.values()];
}

async function existingLinkedFile(client: BambuBuddyClient, fileId: string | null) {
  const numericId = Number(fileId);
  if (!Number.isInteger(numericId) || numericId <= 0) return null;
  try {
    return await client.getFile(numericId);
  } catch (error) {
    if (error instanceof BambuBuddyApiError && error.status === 404) return null;
    throw error;
  }
}

async function syncTags(client: BambuBuddyClient, fileId: number, productTags: string[]) {
  const desiredNames = Array.from(new Map(
    productTags.map((tag) => tag.trim()).filter(Boolean).map((tag) => [tag.toLocaleLowerCase(), tag]),
  ).values());
  let tags = await client.listTags();
  for (const name of desiredNames) {
    if (tags.some((tag) => tag.name.localeCompare(name, undefined, { sensitivity: "base" }) === 0)) continue;
    try {
      tags.push(await client.createTag(name));
    } catch (error) {
      if (!(error instanceof BambuBuddyApiError) || error.status !== 409) throw error;
      tags = await client.listTags();
    }
  }
  tags = await client.listTags();
  const tagIds = desiredNames.map((name) => tags.find((tag) => tag.name.localeCompare(name, undefined, { sensitivity: "base" }) === 0)?.id);
  if (tagIds.some((id) => id === undefined)) throw new Error("BamBuddy did not return one or more newly created tags.");
  const result = await client.replaceFileTags(fileId, tagIds as number[]);
  if (result.files_updated !== 1) throw new Error("BamBuddy did not update tags for the published file.");
}

export async function publishProductPrintReadyFile(productId: string) {
  const [product, artifact, processed, settings, apiKey] = await Promise.all([
    prisma.product.findUnique({ where: { id: productId } }),
    prisma.productArtifact.findUnique({ where: { productId_kind: { productId, kind: "PRINT_READY" } } }),
    prisma.productArtifact.findUnique({ where: { productId_kind: { productId, kind: "PROCESSED_3MF" } } }),
    getSettings(),
    getBambuBuddyApiKey(),
  ]);
  if (!product) throw new Error("Product not found.");
  if (!artifact) throw new Error("Upload a print-ready .gcode.3mf before publishing.");
  if (!processed || artifact.basedOnProcessedSha256 !== processed.sha256) {
    throw new Error("The print-ready file is stale. Slice and upload the current processed 3MF before publishing.");
  }
  const creator = product.importSourceCreatorName?.trim();
  if (!creator) throw new Error("Assign a creator to this Product before publishing to BamBuddy.");
  if (!settings.bambuBuddyBaseUrl) throw new Error("Configure the BamBuddy URL in Admin Settings.");

  await prisma.productArtifact.update({ where: { id: artifact.id }, data: { lastPublishAttemptAt: new Date(), lastPublishError: null } });
  const client = new BambuBuddyClient(settings.bambuBuddyBaseUrl, apiKey);
  try {
    const linkedFile = await existingLinkedFile(client, product.bambuBuddyFileId);
    const linkedFileIsCurrent = Boolean(
      linkedFile && artifact.publishedSha256 === artifact.sha256 && linkedFile.id === Number(product.bambuBuddyFileId),
    );
    const folderId = linkedFileIsCurrent && linkedFile && linkedFile.folder_id !== null
      ? linkedFile.folder_id
      : await resolveBambuBuddyFolderHierarchy(client, [creator, product.publicName]);
    let fileName = artifact.bambuBuddyFileName ?? (linkedFileIsCurrent ? linkedFile?.filename ?? null : null);
    let fileId: number;

    if (linkedFile && linkedFileIsCurrent) {
      fileId = linkedFile.id;
    } else {
      const folderFiles = await client.listFiles(folderId);
      if (!fileName) {
        fileName = chooseBambuBuddyGcodeFileName(
          product.publicName,
          artifact.artifactVersionAt,
          folderFiles.map((file) => file.filename),
        );
        await prisma.productArtifact.update({ where: { id: artifact.id }, data: { bambuBuddyFileName: fileName } });
      }
      const existing = folderFiles.find((file) => file.filename === fileName);
      if (existing && existing.file_size !== Number(artifact.sizeBytes)) {
        throw new Error(`BamBuddy already contains ${fileName} with a different size. Resolve that collision before retrying.`);
      }
      fileId = existing?.id ?? (await client.uploadFile(folderId, resolvePrivateStoragePath(artifact.storageKey), fileName)).id;
    }

    await prisma.$transaction([
      prisma.product.update({ where: { id: productId }, data: { bambuBuddyFileId: String(fileId) } }),
      prisma.productArtifact.update({ where: { id: artifact.id }, data: { publishedSha256: artifact.sha256, lastPublishError: null } }),
    ]);

    await syncTags(client, fileId, product.tags);
    await prisma.productArtifact.update({ where: { id: artifact.id }, data: { bambuBuddyTagsSyncedAt: new Date(), lastPublishError: null } });

    const remoteFile = await client.getFile(fileId);
    await updateBambuBuddyProductData({
      productId,
      fileId: String(fileId),
      printTimeSeconds: finiteNonNegativeNumber(remoteFile.metadata?.print_time_seconds ?? remoteFile.print_time_seconds),
      filamentUsedGrams: finiteNonNegativeNumber(remoteFile.metadata?.filament_used_grams ?? remoteFile.filament_used_grams),
      filamentRequirements: filamentRequirements(remoteFile),
    });
    return { fileId, fileName: fileName ?? linkedFile?.filename ?? null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "BamBuddy publish failed.";
    await prisma.productArtifact.update({ where: { id: artifact.id }, data: { lastPublishError: message, lastPublishAttemptAt: new Date() } });
    throw error;
  }
}
