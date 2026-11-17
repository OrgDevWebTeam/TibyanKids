import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import User from "../../src/Models/User.js";
import { startTestApp, stopTestApp, api } from "../helpers/api.js";

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
});
