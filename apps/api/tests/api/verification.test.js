import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import User from "../../src/Models/User.js";
import { startTestApp, stopTestApp, api } from "../helpers/api.js";

// Loaded after the test helper, because the mailer reads the settings the helper sets.
const { outbox } = await import("../../src/utils/mailer.js");

let counter = 0;

/** Registers a parent and returns the login token and the emailed verification token. */
async function newParent() {
  counter += 1;
  const email = `verify${counter}@test.com`;
  const res = await api("/auth/register", {
    method: "POST",
    body: { name: "Parent", email, password: "Password123!", policyVersion: "v1" },
  });
  const mail = outbox.findLast((m) => m.to === email);
  return { email, jwt: res.json.token, emailToken: mail.token };
}

const verify = (token) => api("/auth/verify-email", { method: "POST", body: { token } });
const resend = (jwt) => api("/auth/resend-verification", { method: "POST", token: jwt });

describe("email verification (FR-AUTH-001)", () => {
  before(startTestApp);
  after(stopTestApp);

  it("verifies the parent with the emailed token and removes the token", async () => {
    const p = await newParent();
    const res = await verify(p.emailToken);
    assert.equal(res.status, 200);

    const user = await User.findOne({ email: p.email }).select(
      "+verificationTokenHash +verificationExpiresAt",
    );
    assert.ok(user.emailVerifiedAt instanceof Date);
    assert.equal(user.verificationTokenHash, undefined);
    assert.equal(user.verificationExpiresAt, undefined);
  });

  it("a token can only be used once", async () => {
    const p = await newParent();
    assert.equal((await verify(p.emailToken)).status, 200);
    assert.equal((await verify(p.emailToken)).status, 400);
  });

  it("refuses a token that was never issued", async () => {
    assert.equal((await verify("a".repeat(64))).status, 400);
  });

  it("refuses a malformed token or extra fields", async () => {
    for (const token of ["short", "z".repeat(64), "", 123]) {
      assert.equal((await verify(token)).status, 400, `accepted ${token}`);
    }
    const extra = await api("/auth/verify-email", {
      method: "POST",
      body: { token: "a".repeat(64), email: "x@test.com" },
    });
    assert.equal(extra.status, 400);
  });

  it("refuses an expired token, and the parent stays unverified", async () => {
    const p = await newParent();
    await User.updateOne(
      { email: p.email },
      { verificationExpiresAt: new Date(Date.now() - 1000) },
    );
    assert.equal((await verify(p.emailToken)).status, 400);

    const user = await User.findOne({ email: p.email });
    assert.equal(user.emailVerifiedAt, null);
  });

  it("resend needs a signed-in parent", async () => {
    const res = await api("/auth/resend-verification", { method: "POST" });
    assert.equal(res.status, 401);
  });

  it("resend sends a new token and the old one stops working", async () => {
    const p = await newParent();
    assert.equal((await resend(p.jwt)).status, 200);

    const fresh = outbox.findLast((m) => m.to === p.email).token;
    assert.notEqual(fresh, p.emailToken);
    assert.equal((await verify(p.emailToken)).status, 400);
    assert.equal((await verify(fresh)).status, 200);
  });

  it("resend is refused for an already verified parent", async () => {
    const p = await newParent();
    assert.equal((await verify(p.emailToken)).status, 200);
    assert.equal((await resend(p.jwt)).status, 409);
  });
});
