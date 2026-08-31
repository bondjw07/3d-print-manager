import { createWriteStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import yauzl, { type Entry, type ZipFile } from "yauzl";

export type ThreeMfCandidate = {
  entryPath: string | null;
  fileName: string;
  sizeBytes: string;
};

export type SourcePackageManifest = {
  kind: "THREE_MF" | "ZIP" | "OTHER";
  threeMfCandidates: ThreeMfCandidate[];
  entryCount?: number;
  expandedSizeBytes?: string;
};

type ZipSafetyLimits = {
  expandedMaxBytes: bigint;
  maxEntries: number;
  maxCompressionRatio: number;
};

function openZip(filePath: string) {
  return new Promise<ZipFile>((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, autoClose: true, validateEntrySizes: true }, (error, zipFile) => {
      if (error || !zipFile) reject(error ?? new Error("Unable to open ZIP file."));
      else resolve(zipFile);
    });
  });
}

function safeArchivePath(fileName: string) {
  if (!fileName || fileName.includes("\0") || fileName.includes("\\") || fileName.startsWith("/")) {
    throw new Error(`ZIP contains an unsafe path: ${fileName || "(empty)"}`);
  }
  const segments = fileName.split("/");
  if (segments.some((segment) => segment === "..")) {
    throw new Error(`ZIP contains an unsafe path: ${fileName}`);
  }
  return fileName;
}

function validateEntry(entry: Entry, limits: ZipSafetyLimits) {
  safeArchivePath(entry.fileName);
  if ((entry.generalPurposeBitFlag & 0x1) !== 0) {
    throw new Error(`Encrypted ZIP entries are not supported: ${entry.fileName}`);
  }
  const unixType = (entry.externalFileAttributes >>> 16) & 0o170000;
  if (unixType === 0o120000) {
    throw new Error(`ZIP symbolic links are not supported: ${entry.fileName}`);
  }
  if (entry.uncompressedSize > 0 && entry.compressedSize === 0) {
    throw new Error(`ZIP entry has an unsafe compression ratio: ${entry.fileName}`);
  }
  if (entry.compressedSize > 0 && entry.uncompressedSize / entry.compressedSize > limits.maxCompressionRatio) {
    throw new Error(`ZIP entry exceeds the configured compression ratio: ${entry.fileName}`);
  }
}

export async function inspectSourcePackage(
  filePath: string,
  originalName: string,
  limits: ZipSafetyLimits,
): Promise<SourcePackageManifest> {
  const lowerName = originalName.toLowerCase();
  if (lowerName.endsWith(".3mf")) {
    const fileStats = await stat(filePath);
    return {
      kind: "THREE_MF",
      threeMfCandidates: [{ entryPath: null, fileName: originalName, sizeBytes: String(fileStats.size) }],
    };
  }
  if (!lowerName.endsWith(".zip")) {
    return { kind: "OTHER", threeMfCandidates: [] };
  }

  const zipFile = await openZip(filePath);
  return new Promise<SourcePackageManifest>((resolve, reject) => {
    let settled = false;
    let entryCount = 0;
    let expandedSizeBytes = BigInt(0);
    const candidates: ThreeMfCandidate[] = [];
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      zipFile.close();
      reject(error);
    };

    zipFile.on("error", fail);
    zipFile.on("entry", (entry) => {
      try {
        entryCount += 1;
        if (entryCount > limits.maxEntries) throw new Error("ZIP contains more entries than the configured limit.");
        validateEntry(entry, limits);
        expandedSizeBytes += BigInt(entry.uncompressedSize);
        if (expandedSizeBytes > limits.expandedMaxBytes) {
          throw new Error("ZIP expands beyond the configured size limit.");
        }
        if (!entry.fileName.endsWith("/") && entry.fileName.toLowerCase().endsWith(".3mf")) {
          candidates.push({
            entryPath: entry.fileName,
            fileName: path.posix.basename(entry.fileName),
            sizeBytes: String(entry.uncompressedSize),
          });
        }
        zipFile.readEntry();
      } catch (error) {
        fail(error);
      }
    });
    zipFile.on("end", () => {
      if (settled) return;
      settled = true;
      resolve({
        kind: "ZIP",
        threeMfCandidates: candidates,
        entryCount,
        expandedSizeBytes: expandedSizeBytes.toString(),
      });
    });
    zipFile.readEntry();
  });
}

function openEntryStream(zipFile: ZipFile, entry: Entry) {
  return new Promise<NodeJS.ReadableStream>((resolve, reject) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error || !stream) reject(error ?? new Error("Unable to read ZIP entry."));
      else resolve(stream);
    });
  });
}

export async function extractZipEntry(
  zipPath: string,
  entryPath: string,
  destinationPath: string,
  maxBytes: bigint,
) {
  safeArchivePath(entryPath);
  const zipFile = await openZip(zipPath);
  await mkdir(path.dirname(destinationPath), { recursive: true });

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      zipFile.close();
      reject(error);
    };
    zipFile.on("error", fail);
    zipFile.on("entry", async (entry) => {
      if (entry.fileName !== entryPath) {
        zipFile.readEntry();
        return;
      }
      try {
        if (BigInt(entry.uncompressedSize) > maxBytes) throw new Error("Selected 3MF exceeds the configured size limit.");
        const stream = await openEntryStream(zipFile, entry);
        await pipeline(stream, createWriteStream(destinationPath, { flags: "wx" }));
        settled = true;
        zipFile.close();
        resolve();
      } catch (error) {
        fail(error);
      }
    });
    zipFile.on("end", () => fail(new Error("Selected 3MF was not found in the source package.")));
    zipFile.readEntry();
  });
}
