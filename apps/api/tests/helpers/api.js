import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

// Settings must exist BEFORE the app is imported, because config/env.js checks them on import.
process.env.NODE_ENV = "development";
process.env.DATABASE = "mongodb://x:<PASSWORD>@localhost/x";
process.env.DATABASE_PASSWORD = "x";
process.env.JWT_SECRET = "test-secret-that-is-at-least-32-characters-long";

let replset;
let server;
let base;
let counter = 0;

export async function startTestApp() {
  const { default: app } = await import("../../src/app.js");
  // Registration and consent use transactions, so a replica set is needed.
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replset.getUri());
  server = app.listen(0); // port 0 = pick any free port
  base = `http://127.0.0.1:${server.address().port}`;
}

export async function stopTestApp() {
  server.close();
  await mongoose.disconnect();
  await replset.stop();
}

export async function api(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

/** Registers a new parent (and their family) and returns the token. */
export async function registerParent() {
  counter += 1;
  const res = await api("/auth/register", {
    method: "POST",
    body: {
      name: `Parent ${counter}`,
      email: `parent${counter}@test.com`,
      password: "password123",
    },
  });
  return { token: res.json.token, userId: res.json.user.id, familyId: res.json.family.id };
}

/** Creates a child for the given parent and returns the child. */
export async function createChild(token, overrides = {}) {
  const year = new Date().getFullYear() - 9; // 9 years old, inside the allowed 6-14 range
  const res = await api("/children", {
    method: "POST",
    token,
    body: { name: "Sara", dateOfBirth: `${year}-03-15`, ...overrides },
  });
  return res.json.child;
}
