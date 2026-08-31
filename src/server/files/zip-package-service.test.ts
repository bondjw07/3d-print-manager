import assert from "node:assert/strict";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import yazl from "yazl";
import { inspectSourcePackage } from "./zip-package-service";

async function createZip(filePath: string, entries: Array<[string, string]>) {
  const archive = new yazl.ZipFile();
  for (const [entryPath, contents] of entries) archive.addBuffer(Buffer.from(contents), entryPath);
  const writer = createWriteStream(filePath);
  archive.outputStream.pipe(writer);
  archive.end();
  await new Promise<void>((resolve, reject) => {
    writer.on("close", resolve);
    writer.on("error", reject);
  });
}

const generousLimits = {
  expandedMaxBytes: BigInt(1024 * 1024),
  maxEntries: 100,
  maxCompressionRatio: 1_000,
};

test("ZIP inspection records every nested 3MF without extracting it", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pmp-zip-test-"));
  try {
    const source = path.join(directory, "source.zip");
    await createZip(source, [["models/a.3mf", "a"], ["b.3MF", "bb"], ["notes.txt", "ignore"]]);
    const manifest = await inspectSourcePackage(source, "source.zip", generousLimits);
    assert.equal(manifest.kind, "ZIP");
    assert.equal(manifest.entryCount, 3);
    assert.deepEqual(manifest.threeMfCandidates.map((candidate) => candidate.entryPath), ["models/a.3mf", "b.3MF"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("ZIP inspection enforces entry and expanded-size limits", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pmp-zip-test-"));
  try {
    const source = path.join(directory, "source.zip");
    await createZip(source, [["a.txt", "1234"], ["b.txt", "5678"]]);
    await assert.rejects(
      inspectSourcePackage(source, "source.zip", { ...generousLimits, maxEntries: 1 }),
      /more entries than the configured limit/,
    );
    await assert.rejects(
      inspectSourcePackage(source, "source.zip", { ...generousLimits, expandedMaxBytes: BigInt(7) }),
      /expands beyond the configured size limit/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
