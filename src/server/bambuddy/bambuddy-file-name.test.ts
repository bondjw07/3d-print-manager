import assert from "node:assert/strict";
import test from "node:test";
import { buildBambuBuddyGcodeFileName, chooseBambuBuddyGcodeFileName } from "./bambuddy-file-name";

test("BambuBuddy G-code names contain product name and date without a hash or time", () => {
  assert.equal(
    buildBambuBuddyGcodeFileName("Chunky Jessie", new Date("2026-08-31T23:59:59.000Z")),
    "Chunky Jessie_2026-08-31.gcode.3mf",
  );
});

test("same-day filename collisions receive a numeric suffix", () => {
  const versionAt = new Date("2026-08-31T12:00:00.000Z");
  assert.equal(
    chooseBambuBuddyGcodeFileName("Chunky Jessie", versionAt, [
      "Chunky Jessie_2026-08-31.gcode.3mf",
      "Chunky Jessie_2026-08-31_2.gcode.3mf",
    ]),
    "Chunky Jessie_2026-08-31_3.gcode.3mf",
  );
});
