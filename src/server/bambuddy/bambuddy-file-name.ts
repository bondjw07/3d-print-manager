import { normalizeBambuBuddyFolderName } from "./bambuddy-client";

export function buildBambuBuddyGcodeFileName(productName: string, artifactVersionAt: Date, sequence = 1) {
  if (!Number.isInteger(sequence) || sequence < 1) throw new Error("BambuBuddy filename sequence must be positive.");
  const date = artifactVersionAt.toISOString().slice(0, 10);
  const collisionSuffix = sequence === 1 ? "" : `_${sequence}`;
  return `${normalizeBambuBuddyFolderName(productName)}_${date}${collisionSuffix}.gcode.3mf`;
}

export function chooseBambuBuddyGcodeFileName(productName: string, artifactVersionAt: Date, existingNames: Iterable<string>) {
  const occupied = new Set(existingNames);
  let sequence = 1;
  while (occupied.has(buildBambuBuddyGcodeFileName(productName, artifactVersionAt, sequence))) sequence += 1;
  return buildBambuBuddyGcodeFileName(productName, artifactVersionAt, sequence);
}
