import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import User from "../../src/Models/User.js";
import { startTestApp, stopTestApp, api } from "../helpers/api.js";
import { createHash } from "node:crypto";
// Loaded after the test helper, because the mailer reads the settings the helper sets.
const { mailer, outbox } = await import("../../src/utils/mailer.js");

const register = (body) => api("/auth/register", { method: "POST", body });
const valid = (n) => ({
  name: `Parent ${n}`,
  email: `reg${n}@test.com`,
  password: "password123",
  policyVersion: "v1",
});

describe("registration (FR-AUTH-001)", () => {
  before(startTestApp);
  after(stopTestApp);

  it("stores the accepted policy version, the time and the country", async () => {
    const res = await register({ ...valid(1), country: "Jordan" });
    assert.equal(res.status, 201);

    const user = await User.findOne({ email: "reg1@test.com" });
    assert.equal(user.termsAcceptedVersion, "v1");
    assert.ok(user.termsAcceptedAt instanceof Date);
    assert.equal(user.country, "Jordan");
  });

  it("country is optional", async () => {
    const res = await register(valid(2));
    assert.equal(res.status, 201);
  });

  it("refuses registration without accepting a policy", async () => {
    const withoutPolicy = valid(3);
    delete withoutPolicy.policyVersion;
    assert.equal((await register(withoutPolicy)).status, 400);
    assert.equal((await register({ ...valid(4), policyVersion: "" })).status, 400);
  });

  it("refuses a country that is too long", async () => {
    const res = await register({ ...valid(5), country: "x".repeat(61) });
    assert.equal(res.status, 400);
  });

  it("creates a one-time token, stores only its hash, and emails it", async () => {
    outbox.length = 0;
    const res = await register(valid(10));
    assert.equal(res.status, 201);

    assert.equal(outbox.length, 1);
    const mail = outbox[0];
    assert.equal(mail.to, "reg10@test.com");

    const user = await User.findOne({ email: "reg10@test.com" }).select(
      "+verificationTokenHash +verificationExpiresAt",
    );
    assert.equal(user.emailVerifiedAt, null);
    assert.equal(user.verificationTokenHash, createHash("sha256").update(mail.token).digest("hex"));
    assert.notEqual(user.verificationTokenHash, mail.token);

    const hours = (user.verificationExpiresAt - Date.now()) / 3600000;
    assert.ok(hours > 23 && hours <= 24, `expiry should be about 24 hours, got ${hours}`);

    // The raw token must not leak through the API response.
    assert.ok(!JSON.stringify(res.json).includes(mail.token));
  });

  it("still registers the parent when the verification email cannot be sent", async (t) => {
    t.mock.method(mailer, "sendVerificationEmail", async () => {
      throw new Error("provider down");
    });
    const res = await register(valid(11));
    assert.equal(res.status, 201);
    assert.ok(await User.exists({ email: "reg11@test.com" }));
  });
});
