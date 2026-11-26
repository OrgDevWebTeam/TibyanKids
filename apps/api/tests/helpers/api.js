import { randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

// Settings must exist BEFORE the app is imported, because config/env.js checks them on import.
// The JWT secret is random on every run, so no secret-looking value is written in this file.
process.env.NODE_ENV = "development";
process.env.DATABASE = "mongodb://x:<PASSWORD>@localhost/x";
process.env.DATABASE_PASSWORD = "x";
process.env.JWT_SECRET = randomBytes(32).toString("hex");
process.env.MAIL_LOG = "off";
process.env.AUTH_RATE_LIMIT = "1000";

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

/** Like api(), but returns the raw text and the headers, for answers that are not JSON (a CSV). */
export async function apiRaw(path, { method = "GET", token } = {}) {
  const res = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return { status: res.status, text: await res.text(), headers: res.headers };
}

/** Verifies a parent's email using the token the placeholder mailer recorded. */
export async function verifyEmailFor(email) {
  const { outbox } = await import("../../src/utils/mailer.js");
  const mail = outbox.findLast((m) => m.to === email);
  const res = await api("/auth/verify-email", { method: "POST", body: { token: mail.token } });
  if (res.status !== 200) throw new Error(`could not verify ${email}: ${res.status}`);
}

/** Registers a new parent (and their family). Verified by default; pass { verified: false } to skip. */
export async function registerParent({ verified = true } = {}) {
  counter += 1;
  const email = `parent${counter}@test.com`;
  const res = await api("/auth/register", {
    method: "POST",
    body: {
      name: `Parent ${counter}`,
      email,
      password: "Password123!",
      policyVersion: "v1",
    },
  });
  if (verified) await verifyEmailFor(email);
  return {
    token: res.json.token,
    userId: res.json.user.id,
    familyId: res.json.family.id,
    email,
  };
}

/** Staff accounts cannot be created through the API yet, so tests create them directly. */
export async function makeStaff(role) {
  const { default: User } = await import("../../src/Models/User.js");
  const { signToken } = await import("../../src/utils/token.js");
  counter += 1;
  const user = await User.create({
    name: role,
    email: `${role}${counter}@test.com`,
    passwordHash: "not-a-real-hash",
    role,
    emailVerifiedAt: new Date(),
  });
  return { id: String(user._id), token: signToken(user) };
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
