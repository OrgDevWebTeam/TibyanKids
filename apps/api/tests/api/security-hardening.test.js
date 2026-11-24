import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { inspect } from "node:util";
import { startTestApp, stopTestApp, api, registerParent, createChild } from "../helpers/api.js";

// Checks added by the security review (docs/security-review.md): S-1, S-2 and S-9.
// The settings are read when the app is first imported, so they are set before startTestApp().
process.env.UPLOAD_RATE_LIMIT = "3";
process.env.TRUST_PROXY = "1";

describe("security hardening (SEC-008, SEC-003)", () => {
  let app;
  let owner;
  let other;
  let child;
  let otherChild;

  const upload = (token, id) =>
    api(`/children/${id}/recitation-attempts`, { method: "POST", token, body: {} });

  before(async () => {
    await startTestApp();
    ({ default: app } = await import("../../src/app.js"));
    owner = await registerParent();
    other = await registerParent();
    child = await createChild(owner.token);
    otherChild = await createChild(other.token);
  });
  after(stopTestApp);

  it("S-1: a stricter limit applies to recitation uploads, and then answers 429", async () => {
    // The body is empty on purpose: every request counts, whether or not it is valid
    for (let i = 0; i < 3; i += 1) {
      assert.equal((await upload(owner.token, child._id)).status, 400);
    }
    const limited = await upload(owner.token, child._id);
    assert.equal(limited.status, 429);
    assert.match(limited.json.message, /Too many recordings/);
  });

  it("S-1: the limit is per account, so another family on the same address is not slowed", async () => {
    const res = await upload(other.token, otherChild._id);
    assert.equal(res.status, 400); // reaches the validation: not limited
  });

  it("S-1: the stricter limit does not apply to other routes", async () => {
    assert.equal((await api("/children", { token: owner.token })).status, 200);
  });

  it("S-2: the number of proxies comes from the TRUST_PROXY setting", () => {
    assert.equal(app.get("trust proxy"), 1);
  });

  it("S-9: an unexpected error answers 500 and does not log the values it carries", async () => {
    const { default: Child } = await import("../../src/Models/Child.js");
    const original = Child.find;
    const logged = [];
    const originalLog = console.error;

    const failure = new Error("database exploded");
    failure.keyValue = { email: "secret-family@test.com" };
    failure.errInfo = { document: { name: "Yusuf", dateOfBirth: "2017-03-15" } };

    Child.find = () => {
      throw failure;
    };
    // inspect() prints an error the way the console does, including its extra properties
    console.error = (...args) =>
      logged.push(args.map((a) => (typeof a === "string" ? a : inspect(a))).join(" "));
    let res;
    try {
      res = await api("/children", { token: owner.token });
    } finally {
      Child.find = original;
      console.error = originalLog;
    }

    assert.equal(res.status, 500);
    assert.deepEqual(res.json, { status: "error", message: "Server error" });

    const text = logged.join("\n");
    assert.match(text, /database exploded/); // the error is still logged, for the team
    assert.doesNotMatch(text, /secret-family@test\.com/);
    assert.doesNotMatch(text, /Yusuf/);
    assert.doesNotMatch(text, /2017-03-15/);
  });
});
