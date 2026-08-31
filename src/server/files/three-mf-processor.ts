import { XMLBuilder, XMLParser } from "fast-xml-parser";
import { readThreeMfEntries, rewriteThreeMfEntries } from "./three-mf-archive";

export const MODEL_SETTINGS_PATH = "Metadata/model_settings.config";
export const PROJECT_SETTINGS_PATH = "Metadata/project_settings.config";

export type FilamentMapping = {
  id: string;
  materialType: string;
  hexColor: string;
  colorName: string;
  effectType: string | null;
};

export type PlateMappingProposal = {
  id: string;
  name: string;
  extruders: number[];
  match: "exact" | "close" | "unmatched";
  mappingId: string | null;
};

export type ThreeMfInspection = {
  plates: PlateMappingProposal[];
  filamentCount: number;
};

type XmlNode = Record<string, unknown>;
type ProjectSettings = Record<string, unknown>;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false,
});
const xmlBuilder = new XMLBuilder({ ignoreAttributes: false, format: true, suppressEmptyNode: true });

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export function normalizeMappingName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replaceAll("grey", "gray")
    .replace(/[^a-z0-9]/g, "");
}

export function levenshteinDistance(left: string, right: string) {
  if (left.length < right.length) [left, right] = [right, left];
  let row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const nextRow = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      nextRow.push(Math.min(
        nextRow[rightIndex - 1] + 1,
        row[rightIndex] + 1,
        row[rightIndex - 1] + Number(left[leftIndex - 1] !== right[rightIndex - 1]),
      ));
    }
    row = nextRow;
  }
  return row[row.length - 1];
}

function matchingMapping(plateName: string, mappings: FilamentMapping[]) {
  const key = normalizeMappingName(plateName);
  const exact = mappings.filter((mapping) => normalizeMappingName(mapping.colorName) === key);
  if (exact.length === 1) return { mapping: exact[0], match: "exact" as const };
  const ranked = mappings
    .map((mapping) => ({ score: levenshteinDistance(key, normalizeMappingName(mapping.colorName)), mapping }))
    .sort((left, right) => left.score - right.score);
  if (!ranked.length) return { mapping: null, match: "unmatched" as const };
  const threshold = Math.max(1, Math.min(3, Math.floor(key.length / 7)));
  const best = ranked[0].score;
  const candidates = ranked.filter((item) => item.score === best);
  if (best <= threshold && candidates.length === 1) return { mapping: candidates[0].mapping, match: "close" as const };
  return { mapping: null, match: "unmatched" as const };
}

function metadataValue(node: XmlNode, key: string) {
  const metadata = asArray(node.metadata as XmlNode | XmlNode[] | undefined);
  const match = metadata.find((item) => item["@_key"] === key);
  const value = match?.["@_value"];
  return value === undefined || value === null ? null : String(value);
}

function setMetadataValue(node: XmlNode, key: string, value: string) {
  const metadata = asArray(node.metadata as XmlNode | XmlNode[] | undefined);
  const match = metadata.find((item) => item["@_key"] === key);
  if (match) match["@_value"] = value;
  else metadata.push({ "@_key": key, "@_value": value });
  node.metadata = metadata;
}

function documentRoot(document: XmlNode) {
  const rootKey = Object.keys(document).find((key) => !key.startsWith("?"));
  if (!rootKey || typeof document[rootKey] !== "object" || !document[rootKey]) {
    throw new Error("The 3MF model settings XML is invalid.");
  }
  return document[rootKey] as XmlNode;
}

function parseModelSettings(contents: Buffer) {
  try {
    const document = xmlParser.parse(contents.toString("utf8")) as XmlNode;
    return { document, root: documentRoot(document) };
  } catch (error) {
    throw new Error(`The 3MF model settings XML is invalid: ${error instanceof Error ? error.message : "parse failed"}`);
  }
}

function parseProjectSettings(contents: Buffer) {
  try {
    const settings = JSON.parse(contents.toString("utf8")) as ProjectSettings;
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new Error("settings must be an object");
    return settings;
  } catch (error) {
    throw new Error(`The 3MF project settings are invalid: ${error instanceof Error ? error.message : "parse failed"}`);
  }
}

export async function readP2sReferenceSettings(filePath: string) {
  const entries = await readThreeMfEntries(filePath, [PROJECT_SETTINGS_PATH]);
  const settings = parseProjectSettings(entries.get(PROJECT_SETTINGS_PATH)!);
  if (settings.printer_model !== "Bambu Lab P2S") {
    throw new Error("The reference must be a Bambu Lab P2S project.");
  }
  const profiles = settings.filament_settings_id;
  if (!Array.isArray(profiles) || profiles.length === 0) {
    throw new Error("The P2S reference has no filament profiles.");
  }
  return settings;
}

export function referenceProfileNames(settings: ProjectSettings) {
  return Array.from(new Set(
    (Array.isArray(settings.filament_settings_id) ? settings.filament_settings_id : [])
      .map(String)
      .filter(Boolean),
  ));
}

export async function inspectThreeMf(filePath: string, mappings: FilamentMapping[]): Promise<ThreeMfInspection> {
  const entries = await readThreeMfEntries(filePath, [MODEL_SETTINGS_PATH, PROJECT_SETTINGS_PATH]);
  const { root } = parseModelSettings(entries.get(MODEL_SETTINGS_PATH)!);
  const settings = parseProjectSettings(entries.get(PROJECT_SETTINGS_PATH)!);
  const objects = new Map<string, number>();
  for (const object of asArray(root.object as XmlNode | XmlNode[] | undefined)) {
    const id = object["@_id"];
    const extruder = metadataValue(object, "extruder");
    if (id !== undefined && extruder && /^\d+$/.test(extruder)) objects.set(String(id), Number(extruder));
  }

  const plates = asArray(root.plate as XmlNode | XmlNode[] | undefined).map((plate) => {
    const name = metadataValue(plate, "plater_name") || "(unnamed plate)";
    const extruders = Array.from(new Set(
      asArray(plate.model_instance as XmlNode | XmlNode[] | undefined)
        .map((instance) => metadataValue(instance, "object_id"))
        .map((objectId) => objectId ? objects.get(objectId) : undefined)
        .filter((value): value is number => value !== undefined),
    )).sort((left, right) => left - right);
    const proposal = matchingMapping(name, mappings);
    return {
      id: metadataValue(plate, "plater_id") || "?",
      name,
      extruders,
      match: proposal.match,
      mappingId: proposal.mapping?.id ?? null,
    };
  });
  return {
    plates,
    filamentCount: Array.isArray(settings.filament_colour) ? settings.filament_colour.length : 0,
  };
}

function profileIndex(settings: ProjectSettings, mapping: FilamentMapping) {
  const profiles = Array.isArray(settings.filament_settings_id) ? settings.filament_settings_id.map(String) : [];
  const tokens = [mapping.materialType, mapping.effectType || "Matte"].map((value) => value.trim().toLowerCase()).filter(Boolean);
  const index = profiles.findIndex((profile) => tokens.every((token) => profile.toLowerCase().includes(token)));
  if (index < 0) {
    throw new Error(`The current P2S reference has no ${mapping.materialType} ${mapping.effectType || "Matte"} profile for ${mapping.colorName}.`);
  }
  return index;
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

export async function transformThreeMf(inputPath: string, outputPath: string, input: {
  mappings: FilamentMapping[];
  selections: Record<string, string>;
  referenceSettings: ProjectSettings;
}) {
  const inspection = await inspectThreeMf(inputPath, input.mappings);
  const missing = inspection.plates.filter((plate) => plate.extruders.length > 0 && !input.selections[plate.id]);
  if (missing.length) throw new Error(`Choose a mapping for: ${missing.map((plate) => plate.name).join(", ")}.`);

  const entries = await readThreeMfEntries(inputPath, [MODEL_SETTINGS_PATH]);
  const { document, root } = parseModelSettings(entries.get(MODEL_SETTINGS_PATH)!);
  const settings = cloneValue(input.referenceSettings);
  const filamentColours = settings.filament_colour;
  if (!Array.isArray(filamentColours)) throw new Error("The P2S reference has no filament_colour list to update.");

  const objects = new Map<string, XmlNode>();
  for (const object of asArray(root.object as XmlNode | XmlNode[] | undefined)) {
    if (object["@_id"] !== undefined) objects.set(String(object["@_id"]), object);
  }
  const occupied = new Set<number>();
  for (const object of objects.values()) {
    const value = metadataValue(object, "extruder");
    if (value && /^\d+$/.test(value)) occupied.add(Number(value));
  }

  const mappingsById = new Map(input.mappings.map((mapping) => [mapping.id, mapping]));
  const changes = new Map<number, FilamentMapping>();
  const remappedObjects: Array<{ objectId: string; from: number; to: number; plate: string }> = [];
  for (const plate of asArray(root.plate as XmlNode | XmlNode[] | undefined)) {
    const plateId = metadataValue(plate, "plater_id") || "?";
    const mappingId = input.selections[plateId];
    if (!mappingId) continue;
    const selected = mappingsById.get(mappingId);
    if (!selected) throw new Error("A selected filament mapping no longer exists in PMP.");

    for (const instance of asArray(plate.model_instance as XmlNode | XmlNode[] | undefined)) {
      const objectId = metadataValue(instance, "object_id");
      const object = objectId ? objects.get(objectId) : undefined;
      const originalExtruder = object ? Number(metadataValue(object, "extruder") || 0) : 0;
      if (!object || !objectId || !originalExtruder) continue;
      let extruder = originalExtruder;
      const current = changes.get(extruder);
      if (current && current.id !== selected.id) {
        const matchingSlot = Array.from(changes.entries()).find(([, mapping]) => mapping.id === selected.id)?.[0];
        const freeSlot = matchingSlot ?? Array.from({ length: filamentColours.length }, (_, index) => index + 1).find((slot) => !occupied.has(slot));
        if (!freeSlot) throw new Error(`This project needs more distinct filament slots than the P2S reference supports (${filamentColours.length}).`);
        if (!matchingSlot) occupied.add(freeSlot);
        setMetadataValue(object, "extruder", String(freeSlot));
        remappedObjects.push({ objectId, from: extruder, to: freeSlot, plate: plateId });
        extruder = freeSlot;
      }
      changes.set(extruder, selected);
    }
  }
  if (!changes.size) throw new Error("No colorable objects were found on the selected 3MF plates.");

  for (const [extruder, mapping] of changes) {
    const index = extruder - 1;
    if (index < 0 || index >= filamentColours.length) {
      throw new Error(`Object references extruder ${extruder}, outside the P2S reference color list.`);
    }
    const sourceIndex = profileIndex(settings, mapping);
    for (const [key, value] of Object.entries(settings)) {
      if (key.startsWith("filament_") && Array.isArray(value) && value.length === filamentColours.length && sourceIndex < value.length) {
        value[index] = cloneValue(value[sourceIndex]);
      }
    }
    (settings.filament_colour as unknown[])[index] = mapping.hexColor.toUpperCase();
  }

  const modelXml = Buffer.from(xmlBuilder.build(document), "utf8");
  const projectJson = Buffer.from(`${JSON.stringify(settings, null, 4)}\n`, "utf8");
  await rewriteThreeMfEntries(inputPath, outputPath, new Map([
    [MODEL_SETTINGS_PATH, modelXml],
    [PROJECT_SETTINGS_PATH, projectJson],
  ]));
  return {
    inspection,
    changedExtruders: Object.fromEntries(Array.from(changes, ([slot, mapping]) => [slot, mapping.id])),
    remappedObjects,
    convertedToP2S: true,
  };
}
