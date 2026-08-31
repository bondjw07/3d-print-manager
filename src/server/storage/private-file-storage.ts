import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export type StoredPrivateFile = {
  storageKey: string;
  sizeBytes: bigint;
  sha256: string;
};

const configuredRoot = process.env.PMP_FILE_STORAGE_ROOT?.trim();
export const privateFileStorageRoot = path.resolve(
  /* turbopackIgnore: true */ configuredRoot || path.join(process.cwd(), "public", "uploads", "pmp-files"),
);

function validateSegment(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Invalid private storage path segment.");
  }
  return value;
}

function safeExtension(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".gcode.3mf")) return ".gcode.3mf";
  const extension = path.extname(lower);
  return /^\.[a-z0-9]{1,12}$/.test(extension) ? extension : "";
}

export function productSourceStorageKey(productId: string, sourceFileId: string, originalName: string) {
  return path.posix.join(
    "products",
    validateSegment(productId),
    "sources",
    validateSegment(sourceFileId),
    `${randomUUID()}${safeExtension(originalName)}`,
  );
}

export function productArtifactStorageKey(productId: string, kind: "processed" | "print-ready", fileName: string) {
  return path.posix.join(
    "products",
    validateSegment(productId),
    "artifacts",
    kind,
    `${randomUUID()}${safeExtension(fileName)}`,
  );
}

export function applicationFileStorageKey(kind: "p2s-reference", fileName: string) {
  return path.posix.join("application", kind, `${randomUUID()}${safeExtension(fileName)}`);
}

export function resolvePrivateStoragePath(storageKey: string) {
  if (!storageKey || path.isAbsolute(storageKey) || storageKey.includes("\\")) {
    throw new Error("Invalid private storage key.");
  }

  const resolved = path.resolve(/* turbopackIgnore: true */ privateFileStorageRoot, storageKey);
  if (resolved !== privateFileStorageRoot && !resolved.startsWith(`${privateFileStorageRoot}${path.sep}`)) {
    throw new Error("Private storage key escapes the configured root.");
  }
  return resolved;
}

async function commitTempFile(tempPath: string, finalPath: string) {
  await mkdir(path.dirname(finalPath), { recursive: true });
  await rename(tempPath, finalPath);
}

async function* webStreamChunks(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      if (value) yield Buffer.from(value);
    }
  } finally {
    reader.releaseLock();
  }
}

export class PrivateFileStorage {
  async saveWebStream(storageKey: string, body: ReadableStream<Uint8Array>, maxBytes: bigint): Promise<StoredPrivateFile> {
    const finalPath = resolvePrivateStoragePath(storageKey);
    await mkdir(path.dirname(finalPath), { recursive: true });
    const tempPath = `${finalPath}.tmp-${randomUUID()}`;
    const hash = createHash("sha256");
    let sizeBytes = BigInt(0);

    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        sizeBytes += BigInt(chunk.byteLength);
        if (sizeBytes > maxBytes) {
          callback(new Error("File exceeds the configured upload limit."));
          return;
        }
        hash.update(chunk);
        callback(null, chunk);
      },
    });

    try {
      await pipeline(Readable.from(webStreamChunks(body)), limiter, createWriteStream(tempPath, { flags: "wx" }));
      await commitTempFile(tempPath, finalPath);
      return { storageKey, sizeBytes, sha256: hash.digest("hex") };
    } catch (error) {
      await this.deleteAbsolutePath(tempPath);
      throw error;
    }
  }

  async saveBuffer(storageKey: string, contents: Uint8Array, maxBytes: bigint): Promise<StoredPrivateFile> {
    const sizeBytes = BigInt(contents.byteLength);
    if (sizeBytes > maxBytes) throw new Error("File exceeds the configured upload limit.");
    const finalPath = resolvePrivateStoragePath(storageKey);
    await mkdir(path.dirname(finalPath), { recursive: true });
    const tempPath = `${finalPath}.tmp-${randomUUID()}`;
    try {
      await writeFile(tempPath, contents, { flag: "wx" });
      await commitTempFile(tempPath, finalPath);
      return {
        storageKey,
        sizeBytes,
        sha256: createHash("sha256").update(contents).digest("hex"),
      };
    } catch (error) {
      await this.deleteAbsolutePath(tempPath);
      throw error;
    }
  }

  async saveFile(storageKey: string, sourcePath: string, maxBytes: bigint): Promise<StoredPrivateFile> {
    const sourceStats = await stat(sourcePath);
    if (BigInt(sourceStats.size) > maxBytes) throw new Error("File exceeds the configured upload limit.");
    const finalPath = resolvePrivateStoragePath(storageKey);
    await mkdir(path.dirname(finalPath), { recursive: true });
    const tempPath = `${finalPath}.tmp-${randomUUID()}`;
    const hash = createHash("sha256");
    let sizeBytes = BigInt(0);
    const digest = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        sizeBytes += BigInt(chunk.byteLength);
        if (sizeBytes > maxBytes) return callback(new Error("File exceeds the configured upload limit."));
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    try {
      await pipeline(createReadStream(sourcePath), digest, createWriteStream(tempPath, { flags: "wx" }));
      await commitTempFile(tempPath, finalPath);
      return { storageKey, sizeBytes, sha256: hash.digest("hex") };
    } catch (error) {
      await this.deleteAbsolutePath(tempPath);
      throw error;
    }
  }

  createReadStream(storageKey: string) {
    return createReadStream(resolvePrivateStoragePath(storageKey));
  }

  async stat(storageKey: string) {
    return stat(resolvePrivateStoragePath(storageKey));
  }

  async delete(storageKey: string) {
    await this.deleteAbsolutePath(resolvePrivateStoragePath(storageKey));
  }

  private async deleteAbsolutePath(filePath: string) {
    try {
      await unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export const privateFileStorage = new PrivateFileStorage();
