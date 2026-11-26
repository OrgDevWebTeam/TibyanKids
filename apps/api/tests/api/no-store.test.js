import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import "../helpers/api.js"; // sets the settings the app needs

describe("API answers are not stored by browsers or proxies", () => {
  let server;
  let base;

  before(async () => {
    const { default: app } = await import("../../src/app.js");
    server = app.listen(0);
    base = `http://127.0.0.1:${server.address().port}/api/v1`;
  });
  after(() => server.close());

  it("sends no-store on answers and on errors", async () => {
    for (const path of ["/health", "/children", "/nothing"]) {
      const res = await fetch(`${base}${path}`);
      assert.equal(res.headers.get("cache-control"), "no-store", path);
    }
  });
});
