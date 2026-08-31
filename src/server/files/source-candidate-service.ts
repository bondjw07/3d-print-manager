import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ProductSourceFile } from "@/generated/prisma/client";
import { resolvePrivateStoragePath } from "@/server/storage/private-file-storage";
import { extractZipEntry, type SourcePackageManifest } from "./zip-package-service";

function candidateExists(sourceFile: ProductSourceFile, entryPath: string | null) {
  const manifest = sourceFile.packageManifest as SourcePackageManifest | null;
  return Boolean(manifest?.threeMfCandidates.some((candidate) => candidate.entryPath === entryPath));
}

export async function withMaterializedSourceCandidate<T>(input: {
  sourceFile: ProductSourceFile;
  entryPath: string | null;
  maxBytes: bigint;
  run: (filePath: string) => Promise<T>;
}) {
  if (!candidateExists(input.sourceFile, input.entryPath)) {
    throw new Error("The selected 3MF candidate is not part of this source file.");
  }
  const sourcePath = resolvePrivateStoragePath(input.sourceFile.storageKey);
  if (!input.entryPath) return input.run(sourcePath);

  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "pmp-3mf-"));
  const candidatePath = path.join(tempDirectory, "candidate.3mf");
  try {
    await extractZipEntry(sourcePath, input.entryPath, candidatePath, input.maxBytes);
    return await input.run(candidatePath);
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}
