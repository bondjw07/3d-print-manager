import assert from "node:assert/strict";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import yauzl, { type Entry, type ZipFile } from "yauzl";
import yazl from "yazl";
import { inspectThreeMf, levenshteinDistance, normalizeMappingName, transformThreeMf } from "./three-mf-processor";
import { readThreeMfEntries } from "./three-mf-archive";

const modelSettings = `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <object id="1"><metadata key="extruder" value="1"/></object>
  <object id="2"><metadata key="extruder" value="1"/></object>
  <plate><metadata key="plater_id" value="1"/><metadata key="plater_name" value="Charcoal Black"/><model_instance><metadata key="object_id" value="1"/></model_instance></plate>
  <plate><metadata key="plater_id" value="2"/><metadata key="plater_name" value="Cottn White"/><model_instance><metadata key="object_id" value="2"/></model_instance></plate>
</config>`;

const sourceSettings = {
  printer_model: "Original Printer",
  process_marker: "source",
  filament_colour: ["#111111", "#222222", "#333333", "#444444"],
  filament_settings_id: ["Source", "Source", "Source", "Source"],
  filament_type: ["PLA", "PLA", "PLA", "PLA"],
};

const referenceSettings = {
  printer_model: "Bambu Lab P2S",
  process_marker: "reference",
  filament_colour: ["#AAAAAA", "#BBBBBB", "#CCCCCC", "#DDDDDD"],
  filament_settings_id: ["Panchroma PLA Matte @Bambu Lab P2S", "Panchroma PLA Silk @Bambu Lab P2S", "Panchroma PETG Matte @Bambu Lab P2S", "Panchroma PLA Matte @Bambu Lab P2S"],
  filament_type: ["PLA", "PLA", "PETG", "PLA"],
};

const mappings = [
  { id: "black", materialType: "PLA", hexColor: "#2F2E30", colorName: "Charcoal Black", effectType: "Matte" },
  { id: "white", materialType: "PLA", hexColor: "#F4EFEB", colorName: "Cotton White", effectType: "Silk" },
];

async function createThreeMf(filePath: string) {
  const archive = new yazl.ZipFile();
  archive.addBuffer(Buffer.from(modelSettings), "Metadata/model_settings.config");
  archive.addBuffer(Buffer.from(JSON.stringify(sourceSettings)), "Metadata/project_settings.config");
  archive.addBuffer(Buffer.from("unchanged"), "keep.txt");
  const writer = createWriteStream(filePath);
  archive.outputStream.pipe(writer);
  archive.end();
  await new Promise<void>((resolve, reject) => { writer.on("close", resolve); writer.on("error", reject); });
}

function openRawEntryStream(zipFile: ZipFile, entry: Entry) {
  return new Promise<NodeJS.ReadableStream>((resolve, reject) => {
    zipFile.openReadStream(entry, { decodeFileData: false }, (error, stream) => {
      if (error || !stream) reject(error ?? new Error(`Unable to read ${entry.fileName}.`));
      else resolve(stream);
    });
  });
}

function readRawArchiveEntries(filePath: string) {
  return new Promise<Array<{ fileName: string; compressionMethod: number; compressedContents: Buffer }>>((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, autoClose: true }, (openError, zipFile) => {
      if (openError || !zipFile) {
        reject(openError ?? new Error("Unable to open test archive."));
        return;
      }
      const entries: Array<{ fileName: string; compressionMethod: number; compressedContents: Buffer }> = [];
      zipFile.on("error", reject);
      zipFile.on("entry", async (entry) => {
        try {
          const stream = await openRawEntryStream(zipFile, entry);
          const chunks: Buffer[] = [];
          for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          entries.push({ fileName: entry.fileName, compressionMethod: entry.compressionMethod, compressedContents: Buffer.concat(chunks) });
          zipFile.readEntry();
        } catch (error) {
          zipFile.close();
          reject(error);
        }
      });
      zipFile.on("end", () => resolve(entries));
      zipFile.readEntry();
    });
  });
}

test("mapping normalization matches the original utility rules", () => {
  assert.equal(normalizeMappingName("Fossil Grey"), "fossilgray");
  assert.equal(normalizeMappingName("Fóssil-gray!"), "fossilgray");
  assert.equal(levenshteinDistance("savannahyelow", "savannahyellow"), 1);
});

test("inspection always returns exact, close, and editable mapping proposals", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pmp-test-"));
  try {
    const input = path.join(directory, "input.3mf");
    await createThreeMf(input);
    const inspection = await inspectThreeMf(input, mappings);
    assert.equal(inspection.plates.length, 2);
    assert.deepEqual(inspection.plates[0], { id: "1", name: "Charcoal Black", extruders: [1], match: "exact", mappingId: "black" });
    assert.equal(inspection.plates[1].match, "close");
    assert.equal(inspection.plates[1].mappingId, "white");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("transformation replaces complete settings, remaps shared slots, and preserves unrelated entries", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pmp-test-"));
  try {
    const input = path.join(directory, "input.3mf");
    const output = path.join(directory, "output.3mf");
    await createThreeMf(input);
    const originalEntries = await readRawArchiveEntries(input);
    const summary = await transformThreeMf(input, output, {
      mappings,
      selections: { "1": "black", "2": "white" },
      referenceSettings,
    });
    assert.equal(summary.convertedToP2S, true);
    assert.equal(summary.remappedObjects.length, 1);

    const entries = await readThreeMfEntries(output, ["Metadata/model_settings.config", "Metadata/project_settings.config", "keep.txt"]);
    const settings = JSON.parse(entries.get("Metadata/project_settings.config")!.toString("utf8"));
    assert.equal(settings.printer_model, "Bambu Lab P2S");
    assert.equal(settings.process_marker, "reference");
    assert.deepEqual(settings.filament_colour.slice(0, 2), ["#2F2E30", "#F4EFEB"]);
    assert.match(entries.get("Metadata/model_settings.config")!.toString("utf8"), /value="2"/);
    assert.equal(entries.get("keep.txt")!.toString("utf8"), "unchanged");
    const outputEntries = await readRawArchiveEntries(output);
    assert.equal(outputEntries.filter((entry) => entry.fileName === "Metadata/model_settings.config").length, 1);
    assert.equal(outputEntries.filter((entry) => entry.fileName === "Metadata/project_settings.config").length, 1);
    assert.equal(outputEntries.find((entry) => entry.fileName === "Metadata/model_settings.config")?.compressionMethod, 0);
    assert.equal(outputEntries.find((entry) => entry.fileName === "Metadata/project_settings.config")?.compressionMethod, 0);
    assert.deepEqual(
      outputEntries.find((entry) => entry.fileName === "keep.txt")?.compressedContents,
      originalEntries.find((entry) => entry.fileName === "keep.txt")?.compressedContents,
    );
    assert.ok((await readFile(output)).byteLength > 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
