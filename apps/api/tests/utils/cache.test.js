import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createCache } from "../../src/utils/cache.js";

describe("the read cache", () => {
  let time;
  let cache;
  beforeEach(() => {
    time = 0;
    cache = createCache({ ttlMs: 100, maxEntries: 2, now: () => time });
  });

  it("returns a value until it expires", () => {
    cache.set("a", 1);
    time = 99;
    assert.equal(cache.get("a"), 1);
    time = 100;
    assert.equal(cache.get("a"), undefined);
  });

  it("drops the oldest entry when it is full", () => {
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    assert.equal(cache.get("a"), undefined);
    assert.equal(cache.get("b"), 2);
    assert.equal(cache.get("c"), 3);
  });

  it("loads once, then answers from memory", async () => {
    let loads = 0;
    const load = async () => ++loads;
    assert.equal(await cache.getOrLoad("a", load), 1);
    assert.equal(await cache.getOrLoad("a", load), 1);
    assert.equal(loads, 1);
  });

  it("does not save a read that started before clear()", async () => {
    let finish;
    const slow = cache.getOrLoad("a", () => new Promise((resolve) => (finish = resolve)));
    cache.clear();
    finish("old");
    assert.equal(await slow, "old");
    assert.equal(cache.get("a"), undefined);
  });

  it("saves nothing when the load fails", async () => {
    const failing = async () => {
      throw new Error("database down");
    };
    await assert.rejects(cache.getOrLoad("a", failing), /database down/);
    assert.equal(cache.get("a"), undefined);
  });
});
