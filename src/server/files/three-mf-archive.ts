import { execFile } from "node:child_process";
import { constants, createWriteStream } from "node:fs";
import { copyFile, mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import yauzl, { type Entry, type ZipFile } from "yauzl";
import yazl from "yazl";

const execFileAsync = promisify(execFile);

function openZip(filePath: string) {
  return new Promise<ZipFile>((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, autoClose: true, validateEntrySizes: true }, (error, zipFile) => {
      if (error || !zipFile) reject(error ?? new Error("Unable to open 3MF archive."));
      else resolve(zipFile);
    });
  });
}

function openEntryStream(zipFile: ZipFile, entry: Entry) {
  return new Promise<NodeJS.ReadableStream>((resolve, reject) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error || !stream) reject(error ?? new Error(`Unable to read ${entry.fileName}.`));
      else resolve(stream);
    });
  });
}

export async function readThreeMfEntries(filePath: string, names: string[], maxEntryBytes = 64 * 1024 * 1024) {
  const wanted = new Set(names);
  const found = new Map<string, Buffer>();
  const zipFile = await openZip(filePath);
  return new Promise<Map<string, Buffer>>((resolve, reject) => {
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      zipFile.close();
      reject(error);
    };
    zipFile.on("error", fail);
    zipFile.on("entry", async (entry) => {
      if (!wanted.has(entry.fileName)) {
        zipFile.readEntry();
        return;
      }
      try {
        if (entry.uncompressedSize > maxEntryBytes) throw new Error(`${entry.fileName} is unexpectedly large.`);
        const stream = await openEntryStream(zipFile, entry);
        const chunks: Buffer[] = [];
        let total = 0;
        for await (const chunk of stream) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          total += buffer.byteLength;
          if (total > maxEntryBytes) throw new Error(`${entry.fileName} is unexpectedly large.`);
          chunks.push(buffer);
        }
        found.set(entry.fileName, Buffer.concat(chunks));
        zipFile.readEntry();
      } catch (error) {
        fail(error);
      }
    });
    zipFile.on("end", () => {
      if (settled) return;
      settled = true;
      const missing = names.filter((name) => !found.has(name));
      if (missing.length) reject(new Error(`This is not a Bambu Studio project 3MF (missing ${missing.join(", ")}).`));
      else resolve(found);
    });
    zipFile.readEntry();
  });
}

function outputOptions(entry: Entry) {
  const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
  return {
    mtime: entry.getLastModDate(),
    mode: mode || undefined,
    compress: entry.compressionMethod !== 0,
    size: entry.uncompressedSize,
  };
}

async function rewriteThreeMfEntriesPortable(inputPath: string, outputPath: string, replacements: Map<string, Buffer>) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const source = await openZip(inputPath);
  const output = new yazl.ZipFile();
  const fileWriter = createWriteStream(outputPath, { flags: "wx" });
  output.outputStream.pipe(fileWriter);

  const completion = new Promise<void>((resolve, reject) => {
    fileWriter.on("close", resolve);
    fileWriter.on("error", reject);
    output.outputStream.on("error", reject);
  });

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      source.close();
      reject(error);
    };
    source.on("error", fail);
    source.on("entry", async (entry) => {
      try {
        const replacement = replacements.get(entry.fileName);
        if (replacement) {
          const options = outputOptions(entry);
          output.addBuffer(replacement, entry.fileName, { mtime: options.mtime, mode: options.mode, compress: options.compress });
          source.readEntry();
          return;
        }
        if (entry.fileName.endsWith("/")) {
          output.addEmptyDirectory(entry.fileName, outputOptions(entry));
          source.readEntry();
          return;
        }
        const stream = await openEntryStream(source, entry);
        output.addReadStream(stream, entry.fileName, outputOptions(entry));
        stream.once("end", () => source.readEntry());
        stream.once("error", fail);
      } catch (error) {
        fail(error);
      }
    });
    source.on("end", () => {
      if (settled) return;
      settled = true;
      output.end(undefined, resolve);
    });
    source.readEntry();
  });
  await completion;
}

function validateReplacementPath(entryPath: string) {
  if (
    !entryPath
    || entryPath.startsWith("/")
    || entryPath.startsWith("-")
    || entryPath.includes("\\")
    || entryPath.includes("\0")
    || entryPath.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`Invalid 3MF replacement path: ${entryPath || "(empty)"}`);
  }
}

async function verifyReplacements(outputPath: string, replacements: Map<string, Buffer>) {
  const written = await readThreeMfEntries(outputPath, Array.from(replacements.keys()));
  for (const [entryPath, expected] of replacements) {
    if (!written.get(entryPath)?.equals(expected)) {
      throw new Error(`Unable to verify the updated 3MF entry: ${entryPath}`);
    }
  }

  const counts = new Map(Array.from(replacements.keys(), (entryPath) => [entryPath, 0]));
  const zipFile = await openZip(outputPath);
  await new Promise<void>((resolve, reject) => {
    zipFile.on("error", reject);
    zipFile.on("entry", (entry) => {
      if (counts.has(entry.fileName)) counts.set(entry.fileName, (counts.get(entry.fileName) ?? 0) + 1);
      zipFile.readEntry();
    });
    zipFile.on("end", resolve);
    zipFile.readEntry();
  });
  for (const [entryPath, count] of counts) {
    if (count !== 1) throw new Error(`The updated 3MF contains ${count} copies of ${entryPath}; expected exactly one.`);
  }
}

async function rewriteThreeMfEntriesPreservingCompression(
  inputPath: string,
  outputPath: string,
  replacements: Map<string, Buffer>,
) {
  // Updating an existing archive preserves the compressed mesh payloads.
  // Only the small replacement metadata files are stored uncompressed.
  const replacementRoot = await mkdtemp(path.join(os.tmpdir(), "pmp-3mf-replacements-"));
  let outputCreated = false;
  let keepOutput = false;
  try {
    for (const [entryPath, contents] of replacements) {
      validateReplacementPath(entryPath);
      const replacementPath = path.join(replacementRoot, ...entryPath.split("/"));
      await mkdir(path.dirname(replacementPath), { recursive: true });
      await writeFile(replacementPath, contents, { flag: "wx" });
    }

    await mkdir(path.dirname(outputPath), { recursive: true });
    await copyFile(inputPath, outputPath, constants.COPYFILE_EXCL);
    outputCreated = true;
    try {
      await execFileAsync("zip", ["-q", "-0", path.resolve(outputPath), ...replacements.keys()], {
        cwd: replacementRoot,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw new Error(`Unable to update the 3MF archive: ${error instanceof Error ? error.message : "zip failed"}`);
    }

    await verifyReplacements(outputPath, replacements);
    keepOutput = true;
    return true;
  } finally {
    await rm(replacementRoot, { recursive: true, force: true });
    if (outputCreated && !keepOutput) {
      try { await unlink(outputPath); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
}

export async function rewriteThreeMfEntries(inputPath: string, outputPath: string, replacements: Map<string, Buffer>) {
  if (!replacements.size) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await copyFile(inputPath, outputPath, constants.COPYFILE_EXCL);
    return;
  }
  if (await rewriteThreeMfEntriesPreservingCompression(inputPath, outputPath, replacements)) return;
  await rewriteThreeMfEntriesPortable(inputPath, outputPath, replacements);
}
