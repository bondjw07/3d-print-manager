import assert from "node:assert/strict";
import test from "node:test";
import { readApiResponse } from "./api-response";

test("returns JSON API payloads unchanged", async () => {
  const payload = await readApiResponse(new Response(JSON.stringify({ error: "specific error", value: 3 }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  }));
  assert.deepEqual(payload, { error: "specific error", value: 3 });
});

test("turns an HTML 413 proxy response into an actionable upload error", async () => {
  const payload = await readApiResponse(new Response("<html><h1>413 Request Entity Too Large</h1></html>", {
    status: 413,
    statusText: "Request Entity Too Large",
    headers: { "Content-Type": "text/html" },
  }));
  assert.match(payload.error ?? "", /HTTP 413/);
  assert.match(payload.error ?? "", /reverse proxy upload limit/);
});
