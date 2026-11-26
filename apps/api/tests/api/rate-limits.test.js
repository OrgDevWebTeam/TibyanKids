import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestApp, stopTestApp, api } from "../helpers/api.js";

// Small limits for this file only, set before the app is loaded
process.env.AUTH_RATE_LIMIT = "3";
process.env.API_RATE_LIMIT = "3";

describe("rate limits (SEC-008)", () => {
  const account = { email: "limits@test.com", password: "Password123!" };
  const post = (path, body) => api(path, { method: "POST", body });
  const login = (password = account.password) =>
    post("/auth/login", { email: account.email, password });

  before(async () => {
    await startTestApp();
    // The first of the three requests allowed on register
    await post("/auth/register", { ...account, name: "Parent", policyVersion: "v1" });
  });
  after(stopTestApp);

  it("successful logins are not counted", async () => {
    for (let i = 0; i < 5; i += 1) {
      assert.equal((await login()).status, 200);
    }
  });

  it("failed logins are counted, and then even the right password waits", async () => {
    for (let i = 0; i < 3; i += 1) {
      assert.equal((await login("Wrong123!")).status, 401);
    }
    const res = await login();
    assert.equal(res.status, 429);
    assert.equal(res.json.message, "Too many failed logins, please try again later");
  });

  it("registration counts every request, separately from login", async () => {
    assert.equal((await post("/auth/register", {})).status, 400);
    assert.equal((await post("/auth/register", {})).status, 400);
    assert.equal((await post("/auth/register", {})).status, 429);
  });

  it("the other routes share one limit, and health has none", async () => {
    assert.equal((await api("/content")).status, 401);
    assert.equal((await api("/content")).status, 401);
    assert.equal((await api("/children")).status, 401);
    assert.equal((await api("/children")).status, 429);
    assert.equal((await api("/health")).status, 200);
  });
});
