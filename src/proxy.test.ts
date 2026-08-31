import assert from "node:assert/strict";
import test from "node:test";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { config, proxy } from "./proxy";

test("private files in the public uploads mount are never served directly", async () => {
  const url = "http://localhost/uploads/pmp-files/products/product-id/source.gcode.3mf";

  assert.equal(unstable_doesMiddlewareMatch({ config, url, nextConfig: {} }), true);

  const response = await proxy(new NextRequest(url));
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});
