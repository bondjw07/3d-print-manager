import assert from "node:assert/strict";
import test from "node:test";
import { canonicalExpectedPrintReadyName, canonicalFileName, expectedPrintReadyName } from "./print-ready-matching";

test("matches the observed Bambu Studio filename relationship", () => {
  assert.equal(expectedPrintReadyName("Chunky Jessie-P2S-processed.3mf"), "Chunky Jessie-P2S-processed.gcode.3mf");
  assert.equal(canonicalExpectedPrintReadyName("Café.3MF"), canonicalFileName("Cafe\u0301.gcode.3mf"));
  assert.equal(canonicalFileName("C:\\exports\\MODEL.GCODE.3MF"), "model.gcode.3mf");
});
