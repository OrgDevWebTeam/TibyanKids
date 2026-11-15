import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

// Set the settings BEFORE the app is imported, because config/env.js checks them on import.
process.env.NODE_ENV = "development";
process.env.DATABASE = "mongodb://x:<PASSWORD>@localhost/x";
process.env.DATABASE_PASSWORD = "x";
process.env.JWT_SECRET = "test-secret-that-is-at-least-32-characters-long";
const { default: app } = await import("../../src/app.js");

let replset, server, base;

const api = async (path, { method = "GET", token, body } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
};

const register = (n) =>
  api("/api/v1/auth/register", {
    method: "POST",
    body: { name: `Parent ${n}`, email: `p${n}@test.com`, password: "password123" },
  });

describe("family isolation", () => {
  before(async () => {
    // Registration uses transactions, so a replica set is needed, not a single server.
    replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(replset.getUri());
    server = app.listen(0);
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => {
    server.close();
    await mongoose.disconnect();
    await replset.stop();
  });

  it("hides another family's child (404) and refuses anonymous users (401)", async () => {
    const a = await register(1);
    const b = await register(2);
    const year = new Date().getFullYear() - 9;
    const created = await api("/api/v1/children", {
      method: "POST",
      token: a.json.token,
      // Add any other fields your createChildSchema requires.
      body: { name: "Sara", dateOfBirth: `${year}-03-15` },
    });
    assert.equal(created.status, 201);
    const id = created.json.data?.child?._id ?? created.json.child?._id ?? created.json.data?._id;

    assert.equal((await api(`/api/v1/children/${id}`, { token: a.json.token })).status, 200);
    assert.equal((await api(`/api/v1/children/${id}`, { token: b.json.token })).status, 404);
    assert.equal((await api(`/api/v1/children/${id}`)).status, 401);
  });
});
